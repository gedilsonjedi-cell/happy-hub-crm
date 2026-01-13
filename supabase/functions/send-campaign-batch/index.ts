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

// Meta error codes that should trigger retry with backoff
const RETRYABLE_ERROR_CODES = ['131049', '131026', '131047'];

// Maximum retry attempts before marking as permanently failed
const MAX_RETRY_ATTEMPTS = 5;

// Calculate backoff delay in minutes based on retry count
// Uses exponential backoff: 5min, 15min, 45min, 2h, 6h
function calculateBackoffMinutes(retryCount: number): number {
  const baseMinutes = 5;
  const multiplier = Math.pow(3, retryCount);
  const maxMinutes = 360; // 6 hours max
  return Math.min(baseMinutes * multiplier, maxMinutes);
}

function getFirstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
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

// Extract Meta error code from error message
function extractMetaErrorCode(errorMessage: string): string | null {
  const match = errorMessage?.match(/(\d{6})/);
  return match ? match[1] : null;
}

// Processa UM lote de mensagens e retorna imediatamente
// O frontend chama repetidamente até terminar
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { campaignId, batchSize = 1 } = await req.json();

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
    if (campaign.status !== 'running') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: campaign.status,
          done: true,
          message: `Campaign is ${campaign.status}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if completed
    if (campaign.sent_count >= campaign.total_recipients) {
      await supabase.from('campaigns').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', campaignId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          done: true, 
          status: 'completed',
          sent: campaign.sent_count,
          total: campaign.total_recipients
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // Verify that at least one channel is connected AND has valid credentials
    const connectedChannels = channels.filter(c => c.connected && c.access_token);
    if (connectedChannels.length === 0) {
      console.error('[Batch] No connected channels with valid credentials found');
      await supabase.from('campaigns').update({ 
        status: 'paused',
        updated_at: new Date().toISOString()
      }).eq('id', campaignId);
      
      return new Response(
        JSON.stringify({ 
          error: 'Nenhum canal conectado com credenciais válidas. Verifique suas conexões.', 
          done: true,
          needsReconnection: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channelsMap = new Map(channels.map(c => [c.id, c]));
    const templatesMap = new Map(templates.map(t => [t.id, t]));

    // PRIORITY 1: Get recipients ready for retry (their backoff time has passed)
    const now = new Date().toISOString();
    const { data: retryRecipients } = await supabase
      .from('campaign_recipients')
      .select('id, phone, name, status, retry_count')
      .eq('campaign_id', campaignId)
      .eq('status', 'retry_pending')
      .lt('next_retry_at', now)
      .lte('retry_count', MAX_RETRY_ATTEMPTS)
      .order('next_retry_at', { ascending: true })
      .limit(batchSize);

    // PRIORITY 2: Get pending recipients (never sent)
    let pendingRecipients: typeof retryRecipients = [];
    const retryCount = retryRecipients?.length || 0;
    
    if (retryCount < batchSize) {
      const { data: pending } = await supabase
        .from('campaign_recipients')
        .select('id, phone, name, status, retry_count')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize - retryCount);
      
      pendingRecipients = pending || [];
    }

    // Combine recipients
    const allRecipients = [...(retryRecipients || []), ...pendingRecipients];

    // If no recipients in campaign_recipients, try to get from leads table (legacy support)
    let leads: Recipient[] = [];
    if (allRecipients.length === 0) {
      const { data: legacyLeads } = await supabase
        .from('leads')
        .select('phone, name, email, city, state, document, notes')
        .eq('organization_id', campaign.organization_id)
        .limit(campaign.total_recipients);
      
      if (legacyLeads && legacyLeads.length > 0) {
        leads = legacyLeads.slice(campaign.sent_count, campaign.sent_count + batchSize);
      }
    }

    // Check if we have anything to send
    const recipientsToSend = allRecipients.length > 0 
      ? allRecipients.map(r => ({ 
          phone: r.phone, 
          name: r.name || undefined, 
          recipientId: r.id,
          retryCount: r.retry_count || 0,
          isRetry: r.status === 'retry_pending'
        }))
      : leads.map(l => ({ phone: l.phone, name: l.name, recipientId: null, retryCount: 0, isRetry: false }));

    if (recipientsToSend.length === 0) {
      // Check if there are any retry_pending that haven't reached their time yet
      const { count: pendingRetries } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'retry_pending')
        .gt('next_retry_at', now);

      if (pendingRetries && pendingRetries > 0) {
        // There are retries pending but not ready yet - campaign should wait
        console.log(`[Batch] ${pendingRetries} recipients waiting for retry backoff`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            done: false,
            status: 'waiting_retry',
            pendingRetries,
            message: `Aguardando intervalo para ${pendingRetries} retentativas`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if campaign is actually complete
      if (campaign.sent_count >= campaign.total_recipients) {
        await supabase.from('campaigns').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', campaignId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            done: true, 
            status: 'completed',
            sent: campaign.sent_count,
            total: campaign.total_recipients
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Nenhum destinatário encontrado para esta campanha', done: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentThisBatch = 0;
    let deliveredThisBatch = 0;
    let failedThisBatch = 0;
    let retriesScheduled = 0;

    // Process each recipient in the batch
    for (const recipient of recipientsToSend) {
      const idx = campaign.sent_count + sentThisBatch;
      const campaignChannel = campaignChannels[idx % campaignChannels.length] as { channel_id: string; template_id: string };
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id) as { 
        id: string; 
        name: string; 
        variables?: string[] | null; 
        variable_mappings?: Record<string, string> | null 
      } | undefined;

      if (!channel || !template) {
        failedThisBatch++;
        if (!recipient.isRetry) sentThisBatch++;
        // Mark recipient as failed if we have the ID
        if (recipient.recipientId) {
          await supabase.from('campaign_recipients').update({
            status: 'failed',
            error_message: 'Canal ou template não encontrado',
            last_error_code: 'CONFIG_ERROR'
          }).eq('id', recipient.recipientId);
        }
        continue;
      }

      const formattedPhone = formatPhoneNumber(recipient.phone);

      // Build template params
      const templateParams: string[] = [];
      if (template.variables && template.variables.length > 0) {
        for (const varName of template.variables) {
          const mapping = template.variable_mappings?.[varName] || 'manual';
          let value = varName;

          if (mapping === 'contact_first_name') {
            value = getFirstName(recipient.name) || varName;
          } else if (variableFieldMap[mapping]) {
            const field = variableFieldMap[mapping] as keyof Recipient;
            value = String((recipient as unknown as Recipient)[field] || varName);
          }
          templateParams.push(value);
        }
      }

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            channelId: channel.id,
            destination: formattedPhone,
            templateName: template.name,
            templateParams: templateParams.length > 0 ? templateParams : undefined,
            templateLanguage: 'pt_BR',
            campaignId: campaignId
          }),
        });

        const result = await response.json();

        if (result.success) {
          deliveredThisBatch++;
          if (!recipient.isRetry) sentThisBatch++;
          console.log(`[Batch] ✓ Sent to ${formattedPhone}${recipient.isRetry ? ' (retry #' + recipient.retryCount + ')' : ''}`);

          // Update recipient status if we have the ID
          if (recipient.recipientId) {
            await supabase.from('campaign_recipients').update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              retry_count: recipient.retryCount,
              next_retry_at: null,
              last_error_code: null
            }).eq('id', recipient.recipientId);
          }

          // Handle chatbot
          if (campaign.chatbot_enabled && campaign.chatbot_id) {
            const { data: existing } = await supabase
              .from('conversation_assignments')
              .select('id')
              .eq('conversation_phone', formattedPhone)
              .eq('channel_id', channel.id)
              .single();

            if (existing) {
              await supabase.from('conversation_assignments').update({
                campaign_chatbot_id: campaign.chatbot_id,
                is_bot_handling: true,
                updated_at: new Date().toISOString()
              }).eq('id', existing.id);
            } else {
              await supabase.from('conversation_assignments').insert({
                conversation_phone: formattedPhone,
                channel_id: channel.id,
                campaign_chatbot_id: campaign.chatbot_id,
                is_bot_handling: true,
                status: 'pending'
              });
            }
          }
        } else {
          // Check if this is a retryable error (like 131049)
          const errorCode = extractMetaErrorCode(result.error || '');
          const isRetryable = errorCode && RETRYABLE_ERROR_CODES.includes(errorCode);
          
          if (isRetryable && recipient.retryCount < MAX_RETRY_ATTEMPTS) {
            // Schedule retry with exponential backoff
            const backoffMinutes = calculateBackoffMinutes(recipient.retryCount);
            const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
            
            retriesScheduled++;
            console.log(`[Batch] ⏳ Scheduling retry #${recipient.retryCount + 1} for ${formattedPhone} in ${backoffMinutes} minutes (error: ${errorCode})`);
            
            if (recipient.recipientId) {
              await supabase.from('campaign_recipients').update({
                status: 'retry_pending',
                retry_count: recipient.retryCount + 1,
                next_retry_at: nextRetryAt.toISOString(),
                last_error_code: errorCode,
                error_message: `Meta error ${errorCode} - Retry ${recipient.retryCount + 1}/${MAX_RETRY_ATTEMPTS}`
              }).eq('id', recipient.recipientId);
            }
            
            // Don't count as sent or failed yet
            if (!recipient.isRetry) sentThisBatch++;
          } else {
            // Permanent failure
            failedThisBatch++;
            if (!recipient.isRetry) sentThisBatch++;
            console.log(`[Batch] ✗ Failed ${formattedPhone}: ${result.error} (attempts: ${recipient.retryCount + 1})`);
            
            if (recipient.recipientId) {
              await supabase.from('campaign_recipients').update({
                status: 'failed',
                error_message: result.error || 'Erro desconhecido',
                last_error_code: errorCode || 'UNKNOWN',
                retry_count: recipient.retryCount + 1
              }).eq('id', recipient.recipientId);
            }
          }
        }
      } catch (error) {
        failedThisBatch++;
        if (!recipient.isRetry) sentThisBatch++;
        console.error(`[Batch] Error sending to ${formattedPhone}:`, error);
        
        // Update recipient status if we have the ID
        if (recipient.recipientId) {
          await supabase.from('campaign_recipients').update({
            status: 'failed',
            error_message: String(error),
            last_error_code: 'EXCEPTION'
          }).eq('id', recipient.recipientId);
        }
      }
    }

    // Update campaign progress
    const newSentCount = campaign.sent_count + sentThisBatch;
    const newDeliveredCount = campaign.delivered_count + deliveredThisBatch;
    const newFailedCount = campaign.failed_count + failedThisBatch;
    
    // Check if there are pending retries before marking as complete
    const { count: remainingRetries } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'retry_pending');

    const { count: remainingPending } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    const hasMoreWork = (remainingRetries || 0) > 0 || (remainingPending || 0) > 0;
    const isComplete = newSentCount >= campaign.total_recipients && !hasMoreWork;

    await supabase.from('campaigns').update({
      sent_count: newSentCount,
      delivered_count: newDeliveredCount,
      failed_count: newFailedCount,
      status: isComplete ? 'completed' : 'running',
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq('id', campaignId);

    console.log(`[Batch] Campaign ${campaignId}: ${newSentCount}/${campaign.total_recipients} | Retries scheduled: ${retriesScheduled} | Pending retries: ${remainingRetries || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        done: isComplete,
        status: isComplete ? 'completed' : 'running',
        sent: newSentCount,
        delivered: newDeliveredCount,
        failed: newFailedCount,
        total: campaign.total_recipients,
        batchProcessed: sentThisBatch,
        retriesScheduled,
        pendingRetries: remainingRetries || 0
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