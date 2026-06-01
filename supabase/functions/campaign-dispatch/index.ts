import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CampaignRecipient {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  state?: string;
  document?: string;
  notes?: string;
  status: string;
}

interface CampaignChannel {
  channel_id: string;
  template_id: string;
}

interface TemplateData {
  id: string;
  name: string;
  content: string;
  variables: string[] | null;
  variable_mappings: Record<string, string> | null;
}

// Variable mapping to contact field
const variableFieldMap: Record<string, keyof CampaignRecipient> = {
  'contact_name': 'name',
  'contact_full_name': 'name',
  'contact_phone': 'phone',
  'contact_email': 'email',
  'contact_city': 'city',
  'contact_state': 'state',
  'contact_document': 'document',
  'contact_notes': 'notes',
};

function getFirstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

function getRandomInterval(minSeconds: number, maxSeconds: number): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function replaceVariables(
  content: string, 
  recipient: CampaignRecipient, 
  variableMappings: Record<string, string> | null,
  manualValues?: Record<string, string>
): string {
  let result = content;
  const regex = /\*?\[([A-Z_]+)\]\*?/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const varName = match[1];
    let value = '';
    const mapping = variableMappings?.[varName] || 'manual';
    
    if (mapping === 'manual') {
      value = manualValues?.[varName] || '';
    } else if (mapping === 'contact_first_name') {
      value = getFirstName(recipient.name) || '';
    } else if (variableFieldMap[mapping]) {
      const field = variableFieldMap[mapping];
      value = String(recipient[field] || '');
    }
    
    if (value) {
      result = result.replace(fullMatch, value);
    }
  }
  
  return result;
}

// Process entire campaign - NO self-invocation, continuous loop
async function processCampaignDispatch(
  supabaseUrl: string,
  supabaseServiceKey: string,
  campaignId: string,
  recipients: string[],
  manualVariables?: Record<string, string>
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const _extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
  const _extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  const messageDb = (_extUrl && _extKey) ? createClient(_extUrl, _extKey) : supabase;
  
  // External Supabase URL for meta-send
  const externalMetaSendUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || supabaseUrl;
  const externalMetaSendKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || supabaseServiceKey;

  console.log(`[Campaign] Starting campaign ${campaignId} with ${recipients.length} recipients`);

  try {
    // Load campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, campaign_channels(channel_id, template_id, order_index)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('[Campaign] Failed to load campaign:', campaignError);
      return;
    }

    // CRITICAL FIX: Use manual_variables from DB if not passed in request
    // This ensures variables are available when campaign is resumed
    const effectiveManualVariables = manualVariables || (campaign.manual_variables as Record<string, string> | null) || {};

    // Get intervals
    const minInterval = campaign.min_interval || campaign.dispatch_interval || 3;
    const maxInterval = campaign.max_interval || (campaign.dispatch_interval ? campaign.dispatch_interval + 5 : 10);

    // Load channels
    const campaignChannels: CampaignChannel[] = campaign.campaign_channels || [];
    if (campaignChannels.length === 0) {
      console.error('[Campaign] No channels configured');
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId).eq('status', 'running');
      return;
    }

    const channelIds = [...new Set(campaignChannels.map(cc => cc.channel_id))];
    const templateIds = [...new Set(campaignChannels.map(cc => cc.template_id))];

    const { data: channels } = await supabase.from('channels').select('*').in('id', channelIds);
    const { data: templates } = await supabase.from('message_templates').select('*').in('id', templateIds);

    if (!channels || channels.length === 0 || !templates || templates.length === 0) {
      console.error('[Campaign] Missing channels or templates');
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId).eq('status', 'running');
      return;
    }

    const channelsMap = new Map(channels.map(c => [c.id, c]));
    const templatesMap = new Map(templates.map(t => [t.id, t as TemplateData]));

    // Build recipients list
    const campaignRecipients: CampaignRecipient[] = recipients.map((phone, idx) => ({
      id: `recipient_${idx}`,
      phone,
      name: undefined,
      status: 'pending'
    }));

    // Load lead data for variable replacement
    const phones = recipients.map(p => formatPhoneNumber(p));
    const { data: leadsData } = await supabase
      .from('leads')
      .select('phone, name, email, city, state, document, notes')
      .in('phone', phones);

    if (leadsData) {
      const leadsMap = new Map(leadsData.map(l => [formatPhoneNumber(l.phone), l]));
      campaignRecipients.forEach(r => {
        const lead = leadsMap.get(formatPhoneNumber(r.phone));
        if (lead) {
          r.name = lead.name;
          r.email = lead.email;
          r.city = lead.city;
          r.state = lead.state;
          r.document = lead.document;
          r.notes = lead.notes;
        }
      });
    }

    // Get starting point (for resume)
    let sentCount = campaign.sent_count || 0;
    let deliveredCount = campaign.delivered_count || 0;
    let failedCount = campaign.failed_count || 0;

    console.log(`[Campaign] Starting from position ${sentCount}/${campaignRecipients.length}`);

    const isFullMode = minInterval === 0 && maxInterval === 0;

    // Helper to send a single recipient
    async function sendToRecipient(recipient: CampaignRecipient, index: number) {
      const campaignChannel = campaignChannels[index % campaignChannels.length];
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id);

      if (!channel || !template) {
        console.error(`[Campaign] Missing channel/template for ${recipient.phone}`);
        return { success: false, phone: recipient.phone };
      }

      const formattedPhone = formatPhoneNumber(recipient.phone);

      try {
        const templateParams: string[] = [];
        if (template.variables && template.variables.length > 0) {
          for (const varName of template.variables) {
            const mapping = template.variable_mappings?.[varName] || 'manual';
            let value = '';
            if (mapping === 'manual') {
              value = effectiveManualVariables[varName] 
                || effectiveManualVariables[varName.replace(/^VAR_/, 'p')] 
                || effectiveManualVariables[varName.replace(/^p/, 'VAR_')]
                || varName;
            } else if (mapping === 'contact_first_name') {
              value = getFirstName(recipient.name) || varName;
            } else if (variableFieldMap[mapping]) {
              const field = variableFieldMap[mapping];
              value = String(recipient[field] || varName);
            } else {
              value = varName;
            }
            templateParams.push(value);
          }
        }

        const metaSendResponse = await fetch(`${externalMetaSendUrl}/functions/v1/meta-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${externalMetaSendKey}`,
          },
          body: JSON.stringify({
            channelId: channel.id,
            destination: formattedPhone,
            templateName: template.name,
            templateParams: templateParams.length > 0 ? templateParams : undefined,
            // templateLanguage intentionally omitted: meta-send resolves the
            // actual language from Meta so any approved language works.
            campaignId: campaignId
          }),
        });

        const metaSendResult = await metaSendResponse.json();

        if (metaSendResult.success) {
          // Always upsert conversation_assignment with sector_id from campaign
          const campaignSectorId = campaign.sector_id || null;
          const { data: existingAssignment } = await messageDb
            .from('conversation_assignments')
            .select('id')
            .eq('conversation_phone', formattedPhone)
            .eq('channel_id', channel.id)
            .maybeSingle();

          if (existingAssignment) {
            const updatePayload: Record<string, unknown> = { 
              organization_id: channel.organization_id,
              sector_id: campaignSectorId,
              updated_at: new Date().toISOString()
            };
            if (campaign.chatbot_enabled && campaign.chatbot_id) {
              updatePayload.campaign_chatbot_id = campaign.chatbot_id;
              updatePayload.is_bot_handling = true;
            }
            await messageDb.from('conversation_assignments').update(updatePayload).eq('id', existingAssignment.id);
          } else {
            // IMPORTANT: campaigns start as 'archived' — only become 'pending' when client replies
            const insertPayload: Record<string, unknown> = {
              organization_id: channel.organization_id,
              conversation_phone: formattedPhone, 
              channel_id: channel.id,
              sector_id: campaignSectorId,
              status: 'archived'
            };
            if (campaign.chatbot_enabled && campaign.chatbot_id) {
              insertPayload.campaign_chatbot_id = campaign.chatbot_id;
              insertPayload.is_bot_handling = true;
            }
            await messageDb.from('conversation_assignments').insert(insertPayload);
          }
          return { success: true, phone: formattedPhone };
        } else {
          await messageDb.from('whatsapp_messages').insert({
            channel_id: formattedPhone, organization_id: channel.organization_id,
            message_id: `failed_${Date.now()}_${formattedPhone}`, sender_phone: channel.phone,
            message_type: 'template', content: `Template: ${template.name}`,
            direction: 'outbound', status: 'failed',
            metadata: { destination: formattedPhone, error: metaSendResult.error, campaignId }
          });
          return { success: false, phone: formattedPhone, error: metaSendResult.error };
        }
      } catch (error) {
        console.error(`[Campaign] Error sending to ${formattedPhone}:`, error);
        return { success: false, phone: formattedPhone, error: String(error) };
      }
    }

    // === FULL MODE: fire all at once in parallel batches ===
    if (isFullMode) {
      console.log(`[Campaign] 🚀 FULL MODE — sending ${campaignRecipients.length - sentCount} messages in parallel`);
      const remaining = campaignRecipients.slice(sentCount);
      const BATCH_SIZE = 200;
      
      for (let b = 0; b < remaining.length; b += BATCH_SIZE) {
        // Check pause/cancel
        const { data: currentCampaign } = await supabase.from('campaigns').select('status').eq('id', campaignId).single();
        if (currentCampaign?.status === 'paused' || currentCampaign?.status === 'cancelled') {
          console.log(`[Campaign] ${campaignId} is ${currentCampaign.status}, stopping`);
          return;
        }

        const batch = remaining.slice(b, b + BATCH_SIZE);
        console.log(`[Campaign] 🚀 Batch ${Math.floor(b/BATCH_SIZE)+1}: sending ${batch.length} messages`);
        
        const results = await Promise.all(
          batch.map((recipient, idx) => sendToRecipient(recipient, sentCount + b + idx))
        );

        for (const r of results) {
          sentCount++;
          if (r.success) { deliveredCount++; } else { failedCount++; }
        }

        await supabase.from('campaigns').update({ 
          sent_count: sentCount, delivered_count: deliveredCount, failed_count: failedCount 
        }).eq('id', campaignId);
      }
    } else {
      // === STANDARD/WARMUP: sequential with intervals ===
      for (let i = sentCount; i < campaignRecipients.length; i++) {
        const { data: currentCampaign } = await supabase.from('campaigns').select('status').eq('id', campaignId).single();
        if (currentCampaign?.status === 'paused' || currentCampaign?.status === 'cancelled') {
          console.log(`[Campaign] ${campaignId} is ${currentCampaign.status}, stopping at ${sentCount}/${campaignRecipients.length}`);
          return;
        }

        const result = await sendToRecipient(campaignRecipients[i], i);
        sentCount++;
        if (result.success) { deliveredCount++; } else { failedCount++; }

        await supabase.from('campaigns').update({ 
          sent_count: sentCount, delivered_count: deliveredCount, failed_count: failedCount 
        }).eq('id', campaignId);

        if (i < campaignRecipients.length - 1) {
          const randomInterval = getRandomInterval(minInterval, maxInterval);
          console.log(`[Campaign] ⏱ Waiting ${randomInterval}s...`);
          await sleep(randomInterval * 1000);
        }
      }
    }

    // Campaign completed — but never overwrite a paused/cancelled/deleted campaign
    await supabase.from('campaigns').update({ 
      status: 'completed',
      completed_at: new Date().toISOString(),
      sent_count: sentCount,
      delivered_count: deliveredCount,
      failed_count: failedCount
    }).eq('id', campaignId).eq('status', 'running');


    console.log(`[Campaign] ${campaignId} COMPLETED. Sent: ${sentCount}, Delivered: ${deliveredCount}, Failed: ${failedCount}`);

  } catch (error) {
    console.error('[Campaign] Fatal error:', error);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Don't resurrect paused/cancelled/deleted campaigns into failed
    await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId).eq('status', 'running');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaignId } = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { count: recipientsCount, error: recipientsCountError } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (recipientsCountError) {
      console.error(`[campaign-dispatch] Failed to count recipients:`, recipientsCountError);
      return new Response(
        JSON.stringify({ error: 'Falha ao carregar destinatários da campanha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recipientsCount) {
      return new Response(
        JSON.stringify({ error: 'Nenhum destinatário encontrado para esta campanha.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting campaign ${campaignId} - ${recipientsCount} recipients from campaign_recipients`);

    // SAFETY: refuse to start/resume a campaign the user has paused, cancelled or deleted.
    // Only the explicit "Retomar" button (which sets status='running' first) or initial
    // creation (status='draft'/'scheduled') may proceed.
    const { data: currentCampaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();
    if (!currentCampaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!['running', 'draft', 'scheduled'].includes(currentCampaign.status)) {
      console.log(`[campaign-dispatch] Refusing to start campaign ${campaignId} in status ${currentCampaign.status}`);
      return new Response(
        JSON.stringify({ success: false, skipped: true, status: currentCampaign.status, message: `Campaign is ${currentCampaign.status}; not dispatching.` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update campaign status only if not already paused/cancelled/deleted
    await supabase.from('campaigns').update({ 
      status: 'running', 
      started_at: new Date().toISOString(),
      total_recipients: recipients.length 
    }).eq('id', campaignId).in('status', ['running', 'draft', 'scheduled']);


    // Run in background using EdgeRuntime.waitUntil
    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      console.log('[Campaign] Using EdgeRuntime.waitUntil');
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processCampaignDispatch(supabaseUrl, supabaseServiceKey, campaignId, recipients, manualVariables)
      );
    } else {
      console.log('[Campaign] Running without waitUntil');
      processCampaignDispatch(supabaseUrl, supabaseServiceKey, campaignId, recipients, manualVariables)
        .catch(err => console.error('Error:', err));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Campaign started',
        campaignId,
        totalRecipients: recipients.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
