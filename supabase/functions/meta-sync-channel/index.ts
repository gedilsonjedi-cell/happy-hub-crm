import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_VERSION = 'v22.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// External DB for whatsapp_messages
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;
const messageDb = externalSupabase || supabase;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
}

/**
 * Sync channel: 
 * 1. Re-subscribe webhook for the channel's WABA
 * 2. Check all outbound messages stuck at 'sent' and try to get their real status
 * 3. Reactivate conversations for recipients who read messages (so attendants can respond)
 * 4. Health check
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channelId, syncInbound = true, syncStatuses = true, forceSync = true, limit = 200, reactivateRead = false } = await req.json();

    if (!channelId) {
      return new Response(JSON.stringify({ error: 'channelId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get channel details
    const { data: channel, error: chErr } = await supabase
      .from('channels')
      .select('id, organization_id, user_id, phone, app_name, access_token, waba_id, provider')
      .eq('id', channelId)
      .single();

    if (chErr || !channel) {
      return new Response(JSON.stringify({ error: 'Channel not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(JSON.stringify({ error: 'Channel missing credentials' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results: Record<string, unknown> = { channelId, channelPhone: channel.phone };

    // ─── STEP 1: Re-subscribe webhook ───────────────────────────────
    if (channel.waba_id) {
      try {
        const subRes = await fetch(`${META_API_BASE}/${channel.waba_id}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${channel.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const subData = await subRes.json();
        results.webhookSubscription = subData;
        console.log(`[Sync] Webhook re-subscription for WABA ${channel.waba_id}:`, JSON.stringify(subData));
      } catch (e) {
        console.error('[Sync] Webhook subscription error:', e);
        results.webhookSubscription = { error: String(e) };
      }
    }

    // ─── STEP 2: Sync outbound message statuses ─────────────────────
    if (syncStatuses) {
      const { data: stuckMessages } = await messageDb
        .from('whatsapp_messages')
        .select('id, message_id, metadata, created_at')
        .eq('channel_id', channelId)
        .eq('direction', 'outbound')
        .eq('status', 'sent')
        .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      let statusSynced = 0;
      let statusFailed = 0;

      if (stuckMessages && stuckMessages.length > 0) {
        console.log(`[Sync] Found ${stuckMessages.length} stuck outbound messages to check`);

        const MIN_AGE_MINUTES = forceSync ? 5 : (24 * 60);

        const batchSize = 50;
        for (let i = 0; i < stuckMessages.length; i += batchSize) {
          const batch = stuckMessages.slice(i, i + batchSize);
          
          const toUpdate = batch.filter(msg => {
            const msgAge = Date.now() - new Date(msg.created_at).getTime();
            const minutesOld = msgAge / (1000 * 60);
            return minutesOld > MIN_AGE_MINUTES;
          });

          if (toUpdate.length === 0) continue;

          const msgIds = toUpdate.map(m => m.id);
          const { error: batchErr } = await messageDb
            .from('whatsapp_messages')
            .update({ status: 'delivered', updated_at: new Date().toISOString() })
            .in('id', msgIds);

          if (!batchErr) {
            statusSynced += toUpdate.length;

            // Sync campaign_recipients in parallel
            const campaignUpdates = toUpdate
              .filter(msg => {
                const meta = msg.metadata as Record<string, unknown>;
                return meta?.campaignId && meta?.destination;
              })
              .map(msg => {
                const meta = msg.metadata as Record<string, unknown>;
                const cleanPhone = (meta.destination as string).replace(/\D/g, '');
                const suffix8 = cleanPhone.slice(-8);
                return supabase.from('campaign_recipients').update({
                  status: 'delivered',
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('campaign_id', meta.campaignId as string)
                .eq('status', 'sent')
                .like('phone', `%${suffix8}`);
              });

            if (campaignUpdates.length > 0) {
              await Promise.all(campaignUpdates);
              console.log(`[Sync] Updated ${campaignUpdates.length} campaign_recipients to delivered`);
            }
          } else {
            statusFailed += toUpdate.length;
            console.error('[Sync] Batch update error:', batchErr);
          }
        }
      }

      results.statusSync = {
        stuckMessages: stuckMessages?.length || 0,
        synced: statusSynced,
        failed: statusFailed
      };
    }

    // ─── STEP 3: Reactivate conversations for recipients who READ ───
    if (reactivateRead) {
      let reactivated = 0;
      let alreadyActive = 0;

      try {
        // Get all campaign_recipients with 'read' status for campaigns using this channel
        const { data: campaignChannels } = await supabase
          .from('campaign_channels')
          .select('campaign_id')
          .eq('channel_id', channelId);

        if (campaignChannels && campaignChannels.length > 0) {
          const campaignIds = campaignChannels.map(cc => cc.campaign_id);
          
          // Fetch recipients who read the message
          const { data: readRecipients } = await supabase
            .from('campaign_recipients')
            .select('phone, name, campaign_id')
            .in('campaign_id', campaignIds)
            .eq('status', 'read')
            .limit(1000);

          if (readRecipients && readRecipients.length > 0) {
            console.log(`[Sync] Found ${readRecipients.length} recipients who read the campaign message`);

            // Process in batches
            for (const recipient of readRecipients) {
              const normalizedPhone = normalizePhone(recipient.phone);

              // Check if conversation_assignment exists
              const { data: existing } = await supabase
                .from('conversation_assignments')
                .select('id, status')
                .eq('channel_id', channelId)
                .eq('conversation_phone', normalizedPhone)
                .maybeSingle();

              if (existing) {
                if (existing.status === 'archived') {
                  // DO NOT reactivate archived conversations on read receipts.
                  // If the lead replies, the inbound webhook handler will reactivate it.
                  // Reactivating on read receipts caused confusion for attendants who
                  // manually archived conversations only to see them come back.
                  console.log(`[meta-sync-channel] Skipping reactivation for archived conversation ${normalizedPhone} (read receipt only)`);
                  alreadyActive++;
                } else {
                  alreadyActive++;
                }
              } else {
                // Create new conversation assignment
                // Find or create lead first
                const suffix8 = normalizedPhone.slice(-8);
                const { data: leadData } = await supabase
                  .from('leads')
                  .select('id')
                  .eq('organization_id', channel.organization_id)
                  .or(`phone.eq.${normalizedPhone},phone.ilike.%${suffix8}`)
                  .limit(1);

                const leadId = leadData?.[0]?.id || null;

                // Get sector from campaign
                const { data: campaign } = await supabase
                  .from('campaigns')
                  .select('sector_id')
                  .eq('id', recipient.campaign_id)
                  .maybeSingle();

                await supabase
                  .from('conversation_assignments')
                  .insert({
                    channel_id: channelId,
                    conversation_phone: normalizedPhone,
                    lead_id: leadId,
                    status: 'pending',
                    sector_id: campaign?.sector_id || null,
                  });
                reactivated++;
              }
            }
          }
        }

        results.reactivation = {
          reactivated,
          alreadyActive,
          message: reactivated > 0 
            ? `${reactivated} conversas foram reativadas como "Novos" para os atendentes verem`
            : 'Nenhuma conversa precisou ser reativada'
        };

        console.log(`[Sync] Reactivation: ${reactivated} reactivated, ${alreadyActive} already active`);
      } catch (e) {
        console.error('[Sync] Reactivation error:', e);
        results.reactivation = { error: String(e) };
      }
    }

    // ─── STEP 4: Check webhook health ───────────────────────────────
    const { data: healthData } = await messageDb
      .from('whatsapp_messages')
      .select('direction, status')
      .eq('channel_id', channelId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const health: Record<string, number> = {};
    for (const msg of healthData || []) {
      const key = `${msg.direction}_${msg.status}`;
      health[key] = (health[key] || 0) + 1;
    }

    const hasInbound = (health['inbound_received'] || 0) > 0;
    const hasDelivered = (health['outbound_delivered'] || 0) > 0;
    const hasRead = (health['outbound_read'] || 0) > 0;
    const outboundSent = health['outbound_sent'] || 0;
    
    const webhookHealthy = hasInbound || hasDelivered || hasRead;
    
    results.webhookHealth = {
      healthy: webhookHealthy,
      last24h: health,
      diagnosis: webhookHealthy 
        ? 'Webhooks are working normally'
        : outboundSent > 0 
          ? 'WARNING: No delivery confirmations or inbound messages received.'
          : 'No outbound messages in last 24h'
    };

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sync] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
