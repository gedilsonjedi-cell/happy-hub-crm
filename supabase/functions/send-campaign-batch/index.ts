import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Recipient {
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  state?: string;
  document?: string;
  notes?: string;
}

const variableFieldMap: Record<string, string> = {
  'contact_name': 'name',
  'contact_full_name': 'name',
  'contact_phone': 'phone',
  'contact_email': 'email',
  'contact_city': 'city',
  'contact_state': 'state',
  'contact_document': 'document',
  'contact_notes': 'notes',
};

const RETRYABLE_ERRORS: Record<string, { maxRetries: number; delayHours: number[] }> = {
  '131049': { maxRetries: 3, delayHours: [12, 24, 48] },
  '135000': { maxRetries: 2, delayHours: [1, 2] },
  '131000': { maxRetries: 2, delayHours: [0.5, 1] },
  '130472': { maxRetries: 2, delayHours: [1, 3] },
};

const PERMANENT_ERRORS = [
  '131026', '131042', '131021', '131047', '132001', '132000', '100',
];

function getFirstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

const VALID_BRAZILIAN_DDDS = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46',
  '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '64', '63', '65', '66', '67',
  '71', '73', '74', '75', '77', '79',
  '81', '87', '82', '83', '84', '85', '88', '86', '89',
  '91', '93', '94', '92', '97', '95', '96', '98', '99',
  '68', '69',
];

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  
  let hasCountryCode = false;
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    hasCountryCode = true;
    cleaned = cleaned.substring(2);
  }
  
  if (cleaned.length === 10) {
    const ddd = cleaned.slice(0, 2);
    const firstDigit = cleaned[2];
    if (VALID_BRAZILIAN_DDDS.includes(ddd) && ['6', '7', '8', '9'].includes(firstDigit)) {
      cleaned = ddd + '9' + cleaned.slice(2);
    }
  }
  
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

function extractMetaErrorCode(errorMessage: string): string | null {
  const match = errorMessage?.match(/(\d{6})/);
  return match ? match[1] : null;
}

function isRetryableError(errorCode: string | null): boolean {
  if (!errorCode) return false;
  return !!RETRYABLE_ERRORS[errorCode] && !PERMANENT_ERRORS.includes(errorCode);
}

function getRetryConfig(errorCode: string): { maxRetries: number; delayHours: number[] } | null {
  return RETRYABLE_ERRORS[errorCode] || null;
}

function calculateNextRetryTime(errorCode: string, retryCount: number): Date | null {
  const config = getRetryConfig(errorCode);
  if (!config) return null;
  if (retryCount >= config.maxRetries) return null;
  const delayHours = config.delayHours[retryCount] || config.delayHours[config.delayHours.length - 1];
  return new Date(Date.now() + delayHours * 3600 * 1000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { campaignId, batchSize = 1, processRetries = false } = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, campaign_channels(channel_id, template_id, order_index)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check status
    if (campaign.status !== 'running' && !(processRetries && campaign.status === 'completed')) {
      const { count: pendingRetries } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'waiting_retry')
        .lte('next_retry_at', new Date().toISOString());
      
      if (pendingRetries && pendingRetries > 0) {
        console.log(`[Batch] Campaign ${campaign.name} has ${pendingRetries} retries ready`);
      } else {
        return new Response(
          JSON.stringify({ success: true, status: campaign.status, done: true, message: `Campaign is ${campaign.status}`, pendingRetries: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get channels and templates
    const campaignChannels = campaign.campaign_channels || [];
    if (campaignChannels.length === 0) {
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
      return new Response(
        JSON.stringify({ error: 'No channels configured', done: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channelIds = [...new Set(campaignChannels.map((cc: { channel_id: string }) => cc.channel_id))];
    const templateIds = [...new Set(campaignChannels.map((cc: { template_id: string }) => cc.template_id))];

    const { data: channels } = await supabase.from('channels').select('*').in('id', channelIds);
    const { data: templates } = await supabase.from('message_templates').select('*').in('id', templateIds);

    if (!channels || channels.length === 0 || !templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing channels or templates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // IMPORTANT: avoid blocking dispatch only because `connected` flag is stale.
    // If channel has credentials, we can still attempt sending.
    const dispatchableChannels = channels.filter(c => !!c.access_token);
    if (dispatchableChannels.length === 0) {
      await supabase.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', campaignId);
      return new Response(
        JSON.stringify({ error: 'Nenhum canal com credenciais válidas para envio.', done: true, needsReconnection: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dispatchableChannelIds = new Set(dispatchableChannels.map(c => c.id));
    const activeCampaignChannels = campaignChannels.filter((cc: { channel_id: string; template_id: string }) =>
      dispatchableChannelIds.has(cc.channel_id)
    );

    if (activeCampaignChannels.length === 0) {
      await supabase.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', campaignId);
      return new Response(
        JSON.stringify({ error: 'Nenhum dos canais da campanha está disponível para envio.', done: true, needsReconnection: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-subscribe webhooks on first batch
    if (campaign.sent_count === 0) {
      for (const ch of dispatchableChannels) {
        if (ch.provider === 'meta' && ch.access_token) {
          fetch(`${supabaseUrl}/functions/v1/meta-subscribe-webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ phoneNumberId: ch.app_name, accessToken: ch.access_token, wabaId: ch.waba_id }),
          }).catch(err => console.error(`[Batch] Webhook subscribe error:`, err));
        }
      }
    }

    const channelsMap = new Map(dispatchableChannels.map(c => [c.id, c]));
    const templatesMap = new Map(templates.map(t => [t.id, t]));

    // ===== ATOMIC CLAIM: Use DB function to prevent race conditions =====
    // This atomically marks recipients as 'processing' so concurrent calls can't grab the same ones
    const { data: claimedRecipients, error: claimError } = await supabase
      .rpc('claim_campaign_recipients', {
        p_campaign_id: campaignId,
        p_batch_size: batchSize,
        p_include_retries: true
      });

    if (claimError) {
      console.error('[Batch] Error claiming recipients:', claimError);
      return new Response(
        JSON.stringify({ error: 'Failed to claim recipients', details: claimError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientsToSend = (claimedRecipients || []).map((r: any) => ({
      phone: r.phone,
      name: r.name || undefined,
      recipientId: r.id,
      isRetry: r.is_retry,
      retryCount: r.retry_count || 0
    }));

    console.log(`[Batch] Claimed ${recipientsToSend.length} recipients for campaign ${campaign.name}`);

    // NO LEGACY FALLBACK - only send to campaign_recipients that were atomically claimed
    // This prevents sending to people not in the selected base

    if (recipientsToSend.length === 0) {
      // Get accurate counts
      const { data: counts } = await supabase.rpc('get_campaign_counts', { p_campaign_id: campaignId });
      const c = counts?.[0] || { total_sent: 0, total_delivered: 0, total_failed: 0, total_pending: 0, total_waiting_retry: 0, total_processing: 0 };

      const hasFutureRetries = (c.total_waiting_retry || 0) > 0;
      const hasProcessing = (c.total_processing || 0) > 0;
      const totalProcessed = (Number(c.total_sent) || 0) + (Number(c.total_failed) || 0) + (Number(c.total_waiting_retry) || 0);
      // Only mark complete if ALL recipients have been processed (sent, failed, or retrying)
      // AND no pending/processing remain. Double-check against total_recipients to prevent premature completion.
      const isComplete = !hasProcessing && (c.total_pending || 0) === 0 && totalProcessed >= campaign.total_recipients;

      const newStatus = isComplete ? 'completed' : 'running';
      await supabase.from('campaigns').update({
        status: newStatus,
        completed_at: isComplete ? new Date().toISOString() : null,
        sent_count: Number(c.total_sent) || 0,
        delivered_count: Number(c.total_delivered) || 0,
        failed_count: (Number(c.total_failed) || 0) + (Number(c.total_waiting_retry) || 0),
      }).eq('id', campaignId);

      return new Response(
        JSON.stringify({
          success: true, done: isComplete,
          status: isComplete ? 'completed' : (hasFutureRetries ? 'waiting_retry' : 'running'),
          sent: Number(c.total_sent) || 0,
          delivered: Number(c.total_delivered) || 0,
          failed: (Number(c.total_failed) || 0) + (Number(c.total_waiting_retry) || 0),
          total: campaign.total_recipients,
          pendingRetries: Number(c.total_waiting_retry) || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentThisBatch = 0;
    let failedThisBatch = 0;
    let scheduledRetryThisBatch = 0;

    const manualVariables = campaign.manual_variables as Record<string, string> | null;

    async function processRecipient(recipient: typeof recipientsToSend[0], idx: number) {
      const campaignChannel = activeCampaignChannels[idx % activeCampaignChannels.length] as { channel_id: string; template_id: string };
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id) as {
        id: string; name: string; variables?: string[] | null; variable_mappings?: Record<string, string> | null
      } | undefined;

      if (!channel || !template) {
        await supabase.from('campaign_recipients').update({
          status: 'failed', error_message: 'Canal ou template não encontrado', last_error_code: 'CONFIG_ERROR'
        }).eq('id', recipient.recipientId);
        return { sent: true, failed: true, retry: false };
      }

      const formattedPhone = formatPhoneNumber(recipient.phone);

      const templateParams: string[] = [];
      if (template.variables && template.variables.length > 0) {
        for (const varName of template.variables) {
          const mapping = template.variable_mappings?.[varName] || 'manual';
          let value = '';
          if (mapping === 'contact_first_name') {
            value = getFirstName(recipient.name) || '';
          } else if (variableFieldMap[mapping]) {
            const field = variableFieldMap[mapping] as keyof Recipient;
            value = String((recipient as unknown as Recipient)[field] || '');
          } else if (mapping === 'manual' && manualVariables) {
            const possibleKeys = [
              varName, varName.replace(/^VAR_/, 'p'), varName.replace(/^p/, 'VAR_'),
              `VAR_${varName.replace(/\D/g, '')}`, `p${varName.replace(/\D/g, '')}`,
              varName.toLowerCase(), varName.toUpperCase(),
            ];
            for (const key of possibleKeys) {
              if (manualVariables[key] !== undefined && manualVariables[key] !== '') {
                value = manualVariables[key]; break;
              }
            }
            if (!value) {
              const keys = Object.keys(manualVariables);
              const varIndex = template.variables.indexOf(varName);
              if (varIndex >= 0 && varIndex < keys.length) {
                value = manualVariables[keys[varIndex]] || '';
              }
            }
          }
          if (value.match(/^(VAR_\d+|p\d+)$/i)) value = '';
          templateParams.push(value);
        }
      }

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            channelId: channel.id, destination: formattedPhone, templateName: template.name,
            templateParams: templateParams.length > 0 ? templateParams : undefined,
            templateLanguage: 'pt_BR', campaignId: campaignId
          }),
        });

        const result = await response.json();

        if (result.success) {
          await supabase.from('campaign_recipients').update({
            status: 'sent', sent_at: new Date().toISOString(), error_message: null, last_error_code: null, next_retry_at: null
          }).eq('id', recipient.recipientId);

          // Update conversation assignment
          const { data: existing } = await supabase.from('conversation_assignments').select('id')
            .eq('conversation_phone', formattedPhone).eq('channel_id', channel.id).single();
          if (existing) {
            await supabase.from('conversation_assignments').update({
              campaign_chatbot_id: campaign.chatbot_enabled && campaign.chatbot_id ? campaign.chatbot_id : null,
              is_bot_handling: campaign.chatbot_enabled && !!campaign.chatbot_id,
              status: 'archived', sector_id: campaign.sector_id || null, updated_at: new Date().toISOString()
            }).eq('id', existing.id);
          } else {
            await supabase.from('conversation_assignments').insert({
              conversation_phone: formattedPhone, channel_id: channel.id,
              campaign_chatbot_id: campaign.chatbot_enabled && campaign.chatbot_id ? campaign.chatbot_id : null,
              is_bot_handling: campaign.chatbot_enabled && !!campaign.chatbot_id,
              status: 'archived', sector_id: campaign.sector_id || null
            });
          }
          return { sent: !recipient.isRetry, failed: false, retry: false };
        } else {
          const errorCode = extractMetaErrorCode(result.error || '');
          if (isRetryableError(errorCode)) {
            const currentRetryCount = recipient.retryCount || 0;
            const config = getRetryConfig(errorCode!);
            if (config && currentRetryCount < config.maxRetries) {
              const nextRetryAt = calculateNextRetryTime(errorCode!, currentRetryCount);
              await supabase.from('campaign_recipients').update({
                status: 'waiting_retry', retry_count: currentRetryCount + 1,
                next_retry_at: nextRetryAt?.toISOString(), error_message: result.error || 'Erro temporário',
                last_error_code: errorCode
              }).eq('id', recipient.recipientId);
              return { sent: !recipient.isRetry, failed: false, retry: true };
            }
          }
          await supabase.from('campaign_recipients').update({
            status: 'failed', error_message: result.error || 'Erro desconhecido', last_error_code: errorCode || 'UNKNOWN'
          }).eq('id', recipient.recipientId);
          return { sent: !recipient.isRetry, failed: true, retry: false };
        }
      } catch (error) {
        await supabase.from('campaign_recipients').update({
          status: 'failed', error_message: String(error), last_error_code: 'EXCEPTION'
        }).eq('id', recipient.recipientId);
        return { sent: !recipient.isRetry, failed: true, retry: false };
      }
    }

    // Process all recipients in PARALLEL
    const results = await Promise.all(
      recipientsToSend.map((recipient: any, i: number) => processRecipient(recipient, campaign.sent_count + i))
    );

    for (const r of results) {
      if (r.sent) sentThisBatch++;
      if (r.failed) failedThisBatch++;
      if (r.retry) scheduledRetryThisBatch++;
    }

    // Get accurate counts from DB
    const { data: finalCounts } = await supabase.rpc('get_campaign_counts', { p_campaign_id: campaignId });
    const fc = finalCounts?.[0] || { total_sent: 0, total_delivered: 0, total_failed: 0, total_pending: 0, total_waiting_retry: 0, total_processing: 0 };

    const hasPending = (Number(fc.total_pending) || 0) > 0;
    const hasProcessing = (Number(fc.total_processing) || 0) > 0;
    const hasRetries = (Number(fc.total_waiting_retry) || 0) > 0;
    const totalProcessed = (Number(fc.total_sent) || 0) + (Number(fc.total_failed) || 0) + (Number(fc.total_waiting_retry) || 0);
    // Only mark complete if ALL recipients accounted for AND none pending/processing
    const isComplete = !hasPending && !hasProcessing && totalProcessed >= campaign.total_recipients;

    let newStatus = 'running';
    if (isComplete) newStatus = 'completed';

    // Update campaign with accurate counts
    await supabase.from('campaigns').update({
      status: newStatus,
      sent_count: Number(fc.total_sent) || 0,
      delivered_count: Number(fc.total_delivered) || 0,
      failed_count: (Number(fc.total_failed) || 0) + (Number(fc.total_waiting_retry) || 0),
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq('id', campaignId);

    console.log(`[Batch] Campaign ${campaign.name}: sent=${fc.total_sent}, failed=${fc.total_failed}, pending=${fc.total_pending}, retry=${fc.total_waiting_retry}, processing=${fc.total_processing}`);

    return new Response(
      JSON.stringify({
        success: true,
        done: isComplete,
        status: isComplete ? 'completed' : (hasRetries && !hasPending ? 'waiting_retry' : 'running'),
        sent: Number(fc.total_sent) || 0,
        delivered: Number(fc.total_delivered) || 0,
        failed: (Number(fc.total_failed) || 0) + (Number(fc.total_waiting_retry) || 0),
        total: campaign.total_recipients,
        batchProcessed: sentThisBatch,
        scheduledRetries: scheduledRetryThisBatch,
        pendingRetries: Number(fc.total_waiting_retry) || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Batch] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
