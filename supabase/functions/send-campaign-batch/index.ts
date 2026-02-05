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

// RETRY SYSTEM for temporary Meta errors
// Errors like #131049 (marketing limit) are temporary and can be retried after a delay

// Configuration for retryable errors
// Each error code has maxRetries and delayHours array (exponential backoff)
const RETRYABLE_ERRORS: Record<string, { maxRetries: number; delayHours: number[] }> = {
  '131049': { maxRetries: 3, delayHours: [12, 24, 48] },  // Marketing limit - wait longer
  '135000': { maxRetries: 2, delayHours: [1, 2] },        // Generic error - quick retry
  '131000': { maxRetries: 2, delayHours: [0.5, 1] },      // Internal Meta error
  '130472': { maxRetries: 2, delayHours: [1, 3] },        // Rate limit
};

// Errors that are permanent and should NOT be retried
const PERMANENT_ERRORS = [
  '131026', // Not on WhatsApp
  '131042', // Payment issue
  '131021', // Invalid number
  '131047', // Blocked
  '132001', // Template error
  '132000', // Template not found
  '100',    // Invalid parameter
];

function getFirstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

// Lista de DDDs válidos do Brasil
const VALID_BRAZILIAN_DDDS = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
  '21', '22', '24', // Rio de Janeiro
  '27', '28', // Espírito Santo
  '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
  '41', '42', '43', '44', '45', '46', // Paraná
  '47', '48', '49', // Santa Catarina
  '51', '53', '54', '55', // Rio Grande do Sul
  '61', // Distrito Federal
  '62', '64', // Goiás
  '63', // Tocantins
  '65', '66', // Mato Grosso
  '67', // Mato Grosso do Sul
  '71', '73', '74', '75', '77', // Bahia
  '79', // Sergipe
  '81', '87', // Pernambuco
  '82', // Alagoas
  '83', // Paraíba
  '84', // Rio Grande do Norte
  '85', '88', // Ceará
  '86', '89', // Piauí
  '91', '93', '94', // Pará
  '92', '97', // Amazonas
  '95', // Roraima
  '96', // Amapá
  '98', '99', // Maranhão
  '68', // Acre
  '69', // Rondônia
];

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading zero
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove 55 prefix temporarily for normalization
  let hasCountryCode = false;
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    hasCountryCode = true;
    cleaned = cleaned.substring(2);
  }
  
  // Now 'cleaned' should be just DDD + number (10 or 11 digits)
  
  // If it's 10 digits, might be missing the 9 for mobile
  if (cleaned.length === 10) {
    const ddd = cleaned.slice(0, 2);
    const firstDigit = cleaned[2];
    
    // Check if it's a valid DDD and looks like a mobile (starts with 6, 7, 8, or 9)
    if (VALID_BRAZILIAN_DDDS.includes(ddd) && ['6', '7', '8', '9'].includes(firstDigit)) {
      // Add the missing 9 prefix for mobile numbers
      cleaned = ddd + '9' + cleaned.slice(2);
      console.log(`[FormatPhone] Added 9 to mobile: ${ddd}9${cleaned.slice(3)}`);
    }
  }
  
  // Ensure country code is present
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

// Extract Meta error code from error message
function extractMetaErrorCode(errorMessage: string): string | null {
  const match = errorMessage?.match(/(\d{6})/);
  return match ? match[1] : null;
}

// Check if an error is retryable
function isRetryableError(errorCode: string | null): boolean {
  if (!errorCode) return false;
  return !!RETRYABLE_ERRORS[errorCode] && !PERMANENT_ERRORS.includes(errorCode);
}

// Get retry configuration for an error
function getRetryConfig(errorCode: string): { maxRetries: number; delayHours: number[] } | null {
  return RETRYABLE_ERRORS[errorCode] || null;
}

// Calculate next retry time based on retry count
function calculateNextRetryTime(errorCode: string, retryCount: number): Date | null {
  const config = getRetryConfig(errorCode);
  if (!config) return null;
  
  if (retryCount >= config.maxRetries) return null;
  
  const delayHours = config.delayHours[retryCount] || config.delayHours[config.delayHours.length - 1];
  return new Date(Date.now() + delayHours * 3600 * 1000);
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

    // Check status - allow running or completed (for retry processing)
    if (campaign.status !== 'running' && !(processRetries && campaign.status === 'completed')) {
      // Check if there are pending retries
      const { count: pendingRetries } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'waiting_retry')
        .lte('next_retry_at', new Date().toISOString());
      
      if (pendingRetries && pendingRetries > 0) {
        // There are retries ready to process
        console.log(`[Batch] Campaign ${campaign.name} has ${pendingRetries} retries ready`);
      } else {
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: campaign.status,
            done: true,
            message: `Campaign is ${campaign.status}`,
            pendingRetries: 0
          }),
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

    // First, check for recipients ready for retry (waiting_retry with next_retry_at <= now)
    const { data: retryRecipients } = await supabase
      .from('campaign_recipients')
      .select('id, phone, name, status, retry_count, last_error_code')
      .eq('campaign_id', campaignId)
      .eq('status', 'waiting_retry')
      .lte('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(batchSize);

    // Then get pending recipients (new sends)
    const { data: pendingRecipients } = await supabase
      .from('campaign_recipients')
      .select('id, phone, name, status')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize - (retryRecipients?.length || 0));
    
    // Combine retry and pending recipients, prioritizing retries
    const allRecipients = [
      ...(retryRecipients || []).map(r => ({ ...r, isRetry: true })),
      ...(pendingRecipients || []).map(r => ({ ...r, isRetry: false, retry_count: 0 }))
    ];
    
    // SAFETY CHECK: Log phone numbers we're about to process for debugging
    const phonesToProcess = allRecipients.map(r => r.phone);
    console.log(`[Batch] Processing phones (${retryRecipients?.length || 0} retries, ${pendingRecipients?.length || 0} pending): ${phonesToProcess.join(', ')}`);
    
    // DOUBLE CHECK: Verify no recipients in this batch have already been sent
    let filteredRecipients = allRecipients;
    if (phonesToProcess.length > 0) {
      const { data: alreadySent } = await supabase
        .from('campaign_recipients')
        .select('phone')
        .eq('campaign_id', campaignId)
        .in('phone', phonesToProcess)
        .in('status', ['sent', 'delivered']);
      
      if (alreadySent && alreadySent.length > 0) {
        console.warn(`[Batch] SKIPPING already sent phones: ${alreadySent.map(r => r.phone).join(', ')}`);
        const sentPhones = new Set(alreadySent.map(r => r.phone));
        filteredRecipients = filteredRecipients.filter(r => !sentPhones.has(r.phone));
      }
    }

    // If no recipients in campaign_recipients, try to get from leads table (legacy support)
    let leads: Recipient[] = [];
    if (filteredRecipients.length === 0 && (retryRecipients?.length || 0) === 0) {
      const { data: legacyLeads } = await supabase
        .from('leads')
        .select('phone, name, email, city, state, document, notes')
        .eq('organization_id', campaign.organization_id)
        .limit(campaign.total_recipients);
      
      if (legacyLeads && legacyLeads.length > 0) {
        leads = legacyLeads.slice(campaign.sent_count, campaign.sent_count + batchSize);
      }
    }

    // Build recipients to send
    const recipientsToSend = filteredRecipients.length > 0 
      ? filteredRecipients.map(r => ({ 
          phone: r.phone, 
          name: r.name || undefined, 
          recipientId: r.id,
          isRetry: r.isRetry,
          retryCount: r.retry_count || 0
        }))
      : leads.map(l => ({ phone: l.phone, name: l.name, recipientId: null, isRetry: false, retryCount: 0 }));

    if (recipientsToSend.length === 0) {
      // No pending or retry recipients - check if there are waiting retries for later
      const { count: futureRetries } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'waiting_retry')
        .gt('next_retry_at', new Date().toISOString());

      const hasFutureRetries = (futureRetries || 0) > 0;

      // Count actual results
      const { count: totalSent } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'sent');

      const { count: totalFailed } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'failed');

      const { count: totalWaitingRetry } = await supabase
        .from('campaign_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'waiting_retry');

      // Update campaign status
      const newStatus = hasFutureRetries ? 'running' : 'completed';
      await supabase.from('campaigns').update({
        status: newStatus,
        completed_at: hasFutureRetries ? null : new Date().toISOString(),
        sent_count: campaign.total_recipients,
        delivered_count: totalSent || 0,
        failed_count: totalFailed || 0
      }).eq('id', campaignId);

      console.log(`[Batch] Campaign ${campaignId} ${hasFutureRetries ? 'waiting for retries' : 'completed'}: ${totalSent} delivered, ${totalFailed} failed, ${totalWaitingRetry} waiting retry`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          done: !hasFutureRetries, 
          status: hasFutureRetries ? 'waiting_retry' : 'completed',
          delivered: totalSent || 0,
          failed: totalFailed || 0,
          waitingRetry: totalWaitingRetry || 0,
          total: campaign.total_recipients,
          pendingRetries: futureRetries || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentThisBatch = 0;
    let deliveredThisBatch = 0;
    let failedThisBatch = 0;
    let scheduledRetryThisBatch = 0;

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
        sentThisBatch++;
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

      // Build template params - CRITICAL: Use manual_variables from campaign
      const templateParams: string[] = [];
      const manualVariables = campaign.manual_variables as Record<string, string> | null;
      
      if (template.variables && template.variables.length > 0) {
        for (const varName of template.variables) {
          const mapping = template.variable_mappings?.[varName] || 'manual';
          let value = varName; // Fallback to variable name

          if (mapping === 'contact_first_name') {
            value = getFirstName(recipient.name) || varName;
          } else if (variableFieldMap[mapping]) {
            const field = variableFieldMap[mapping] as keyof Recipient;
            value = String((recipient as unknown as Recipient)[field] || varName);
          } else if (mapping === 'manual' && manualVariables) {
            // CRITICAL FIX: Use manual variables saved in the campaign
            // Try exact match first, then try with different prefixes (VAR_, p)
            const manualValue = manualVariables[varName] 
              || manualVariables[varName.replace(/^VAR_/, 'p')] 
              || manualVariables[varName.replace(/^p/, 'VAR_')];
            if (manualValue) {
              value = manualValue;
            }
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
          console.log(`[Batch] ✓ ${recipient.isRetry ? 'RETRY' : 'Sent'} to ${formattedPhone}`);

          // Update recipient status if we have the ID
          if (recipient.recipientId) {
            await supabase.from('campaign_recipients').update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
              last_error_code: null,
              next_retry_at: null
            }).eq('id', recipient.recipientId);
          }

          // CRITICAL: Create/update conversation assignment for EVERY campaign dispatch
          // Campaigns: status = 'archived' until customer replies
          // This ensures conversations don't disappear and appear in "Arquivados"
          const { data: existing } = await supabase
            .from('conversation_assignments')
            .select('id')
            .eq('conversation_phone', formattedPhone)
            .eq('channel_id', channel.id)
            .single();

          if (existing) {
            // Update existing assignment
            await supabase.from('conversation_assignments').update({
              campaign_chatbot_id: campaign.chatbot_enabled && campaign.chatbot_id ? campaign.chatbot_id : null,
              is_bot_handling: campaign.chatbot_enabled && !!campaign.chatbot_id,
              status: 'archived', // Campaign dispatches go to archived until customer replies
              sector_id: campaign.sector_id || null, // Inherit sector from campaign
              updated_at: new Date().toISOString()
            }).eq('id', existing.id);
          } else {
            // Create NEW assignment with archived status
            // NOTE: conversation_assignments does NOT have organization_id column
            await supabase.from('conversation_assignments').insert({
              conversation_phone: formattedPhone,
              channel_id: channel.id,
              campaign_chatbot_id: campaign.chatbot_enabled && campaign.chatbot_id ? campaign.chatbot_id : null,
              is_bot_handling: campaign.chatbot_enabled && !!campaign.chatbot_id,
              status: 'archived', // Campaign dispatches start as archived
              sector_id: campaign.sector_id || null // Inherit sector from campaign
            });
          }
          console.log(`[Batch] Assignment created/updated for ${formattedPhone} with status: archived, sector: ${campaign.sector_id || 'none'}`);
        } else {
          // Check if error is retryable
          const errorCode = extractMetaErrorCode(result.error || '');
          
          if (isRetryableError(errorCode) && recipient.recipientId) {
            const currentRetryCount = recipient.retryCount || 0;
            const config = getRetryConfig(errorCode!);
            
            if (config && currentRetryCount < config.maxRetries) {
              // Schedule retry
              const nextRetryAt = calculateNextRetryTime(errorCode!, currentRetryCount);
              
              await supabase.from('campaign_recipients').update({
                status: 'waiting_retry',
                retry_count: currentRetryCount + 1,
                next_retry_at: nextRetryAt?.toISOString(),
                error_message: result.error || 'Erro temporário - retry agendado',
                last_error_code: errorCode
              }).eq('id', recipient.recipientId);
              
              scheduledRetryThisBatch++;
              if (!recipient.isRetry) sentThisBatch++;
              
              const hoursUntilRetry = nextRetryAt ? Math.round((nextRetryAt.getTime() - Date.now()) / 3600000) : 0;
              console.log(`[Batch] ⏳ Scheduled retry #${currentRetryCount + 1} for ${formattedPhone} in ${hoursUntilRetry}h (error ${errorCode})`);
            } else {
              // Max retries reached
              await supabase.from('campaign_recipients').update({
                status: 'failed',
                error_message: `Falha após ${currentRetryCount} tentativas: ${result.error}`,
                last_error_code: errorCode || 'MAX_RETRIES'
              }).eq('id', recipient.recipientId);
              
              failedThisBatch++;
              if (!recipient.isRetry) sentThisBatch++;
              console.log(`[Batch] ✗ Max retries reached for ${formattedPhone}`);
            }
          } else {
            // Permanent failure - Mark as failed immediately
            failedThisBatch++;
            if (!recipient.isRetry) sentThisBatch++;
            console.log(`[Batch] ✗ Failed ${formattedPhone}: ${result.error} (code: ${errorCode})`);
            
            if (recipient.recipientId) {
              await supabase.from('campaign_recipients').update({
                status: 'failed',
                error_message: result.error || 'Erro desconhecido',
                last_error_code: errorCode || 'UNKNOWN'
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

    // Check if there are remaining pending or retry recipients
    const { count: remainingPending } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    const { count: waitingRetryNow } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'waiting_retry')
      .lte('next_retry_at', new Date().toISOString());

    const { count: waitingRetryLater } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'waiting_retry')
      .gt('next_retry_at', new Date().toISOString());

    // Get current counts from trigger-updated values
    const { data: updatedCampaign } = await supabase
      .from('campaigns')
      .select('sent_count, delivered_count, failed_count, total_recipients')
      .eq('id', campaignId)
      .single();

    const currentSent = updatedCampaign?.sent_count || 0;
    const currentDelivered = updatedCampaign?.delivered_count || 0;
    const currentFailed = updatedCampaign?.failed_count || 0;
    const totalRecipients = updatedCampaign?.total_recipients || campaign.total_recipients;

    const noPendingOrReadyRetries = (remainingPending || 0) === 0 && (waitingRetryNow || 0) === 0;
    const hasFutureRetries = (waitingRetryLater || 0) > 0;
    const isComplete = noPendingOrReadyRetries && !hasFutureRetries;

    // Determine campaign status
    let newStatus = 'running';
    if (isComplete) {
      newStatus = 'completed';
    } else if (noPendingOrReadyRetries && hasFutureRetries) {
      // All pending done, waiting for scheduled retries
      newStatus = 'running'; // Keep running to continue processing
    }

    // Update campaign status
    await supabase.from('campaigns').update({
      status: newStatus,
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq('id', campaignId);

    console.log(`[Batch] Campaign ${campaignId}: ${currentSent}/${totalRecipients} sent, ${currentDelivered} delivered, ${currentFailed} failed, ${scheduledRetryThisBatch} scheduled retries | Pending: ${remainingPending || 0}, Waiting retry: ${(waitingRetryNow || 0) + (waitingRetryLater || 0)}`);

    return new Response(
      JSON.stringify({
        success: true,
        done: isComplete,
        status: isComplete ? 'completed' : (hasFutureRetries && noPendingOrReadyRetries ? 'waiting_retry' : 'running'),
        sent: currentSent,
        delivered: currentDelivered,
        failed: currentFailed,
        total: totalRecipients,
        batchProcessed: sentThisBatch,
        scheduledRetries: scheduledRetryThisBatch,
        pendingRetries: (waitingRetryNow || 0) + (waitingRetryLater || 0)
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
