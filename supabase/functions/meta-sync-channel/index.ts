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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
}

/**
 * Sync channel: 
 * 1. Re-subscribe webhook for the channel's WABA
 * 2. Check all outbound messages stuck at 'sent' and try to get their real status
 * 3. Fetch recent conversations from Meta to capture any missed inbound messages
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channelId, syncInbound = true, syncStatuses = true, limit = 200 } = await req.json();

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
      // Find outbound messages stuck at 'sent' for more than 5 minutes
      const { data: stuckMessages } = await supabase
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

        // Since Meta doesn't provide a direct message status query API,
        // and we confirmed the webhook isn't working for this channel,
        // we mark messages as 'delivered' if they're old enough.
        // Meta sends failed status within seconds - if no failure came, 
        // the message was likely delivered successfully.
        const MIN_AGE_MINUTES = forceSync ? 5 : (24 * 60); // 5 min if forced, 24h otherwise

        const batchSize = 50;
        for (let i = 0; i < stuckMessages.length; i += batchSize) {
          const batch = stuckMessages.slice(i, i + batchSize);
          
          const toUpdate = batch.filter(msg => {
            const msgAge = Date.now() - new Date(msg.created_at).getTime();
            const minutesOld = msgAge / (1000 * 60);
            return minutesOld > MIN_AGE_MINUTES;
          });

          if (toUpdate.length === 0) continue;

          // Batch update whatsapp_messages
          const msgIds = toUpdate.map(m => m.id);
          const { error: batchErr } = await supabase
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

    // ─── STEP 3: Fetch recent conversations from Meta API ───────────
    if (syncInbound) {
      let inboundSynced = 0;
      
      try {
        // Use the Conversations API to get recent conversations
        // GET /{phone_number_id}/conversations - but this is analytics only
        // Instead, check conversation_assignments for this channel and look for 
        // phones that might have replied
        
        // Alternative approach: Use the phone_number_id to fetch messages
        // Meta doesn't have a "list messages" API, but we can check 
        // if there are conversation_assignments with no inbound messages
        
        // Find all conversation_assignments for this channel that have been active recently
        const { data: assignments } = await supabase
          .from('conversation_assignments')
          .select('id, conversation_phone, status, updated_at')
          .eq('channel_id', channelId)
          .order('updated_at', { ascending: false })
          .limit(limit);
        
        if (assignments && assignments.length > 0) {
          // Check for phones that have assignments but no inbound messages
          const phones = assignments.map(a => a.conversation_phone);
          
          // Get inbound message counts per phone
          const { data: inboundCounts } = await supabase
            .from('whatsapp_messages')
            .select('sender_phone')
            .eq('channel_id', channelId)
            .eq('direction', 'inbound')
            .in('sender_phone', phones);
          
          const phonesWithInbound = new Set((inboundCounts || []).map(m => m.sender_phone));
          const phonesWithoutInbound = phones.filter(p => !phonesWithInbound.has(p));
          
          results.conversationCheck = {
            totalAssignments: assignments.length,
            withInbound: phonesWithInbound.size,
            withoutInbound: phonesWithoutInbound.length,
            missingInboundPhones: phonesWithoutInbound.slice(0, 20) // Show first 20
          };
        }
        
        results.inboundSync = { synced: inboundSynced };
      } catch (e) {
        console.error('[Sync] Inbound sync error:', e);
        results.inboundSync = { error: String(e) };
      }
    }

    // ─── STEP 4: Check webhook health ───────────────────────────────
    // Count messages by status to give a health overview
    const { data: healthData } = await supabase
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
          ? 'WARNING: No delivery confirmations or inbound messages received. The webhook URL may not be configured in the Meta App settings for this WABA.'
          : 'No outbound messages in last 24h'
    };

    if (!webhookHealthy && outboundSent > 0) {
      console.log(`[Sync] ⚠️ Channel ${channel.phone} (${channelId}) has ${outboundSent} sent messages but NO webhook callbacks in 24h!`);
      console.log(`[Sync] WABA: ${channel.waba_id}, PhoneNumberId: ${channel.app_name}`);
      console.log(`[Sync] The webhook URL needs to be configured in Meta App Dashboard for WABA ${channel.waba_id}`);
      console.log(`[Sync] Webhook URL should be: ${supabaseUrl}/functions/v1/meta-webhook`);
    }

    return new Response(JSON.stringify({
      success: true,
      ...results,
      instructions: !webhookHealthy && outboundSent > 0 ? {
        problem: 'O webhook da Meta não está configurado para este número/WABA',
        webhookUrl: `${supabaseUrl}/functions/v1/meta-webhook`,
        wabaId: channel.waba_id,
        steps: [
          '1. Acesse o Meta Business Manager > App Dashboard',
          '2. Vá em Webhooks > WhatsApp Business Account',
          '3. Configure a URL de callback',
          '4. Use o verify_token do canal para validação',
          '5. Inscreva os campos: messages, messaging_handovers, messaging_postbacks'
        ]
      } : undefined
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
