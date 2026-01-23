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

// RETRY SYSTEM DISABLED - Each recipient receives exactly ONE message
// No automatic retries to prevent duplicate message delivery

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

    // Get ONLY pending recipients (never sent before) - NO RETRIES
    // CRITICAL: We explicitly check for 'pending' status to ensure we never send to:
    // - Recipients with status 'sent' (already delivered successfully)
    // - Recipients with status 'delivered' (confirmed delivery)
    // - Recipients with status 'failed' (already attempted, no retry)
    const { data: pendingRecipients } = await supabase
      .from('campaign_recipients')
      .select('id, phone, name, status')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);
    
    // SAFETY CHECK: Log phone numbers we're about to process for debugging
    const phonesToProcess = (pendingRecipients || []).map(r => r.phone);
    console.log(`[Batch] Processing phones: ${phonesToProcess.join(', ')}`);
    
    // DOUBLE CHECK: Verify no recipients in this batch have already been sent
    let filteredRecipients = pendingRecipients || [];
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
    if (filteredRecipients.length === 0) {
      const { data: legacyLeads } = await supabase
        .from('leads')
        .select('phone, name, email, city, state, document, notes')
        .eq('organization_id', campaign.organization_id)
        .limit(campaign.total_recipients);
      
      if (legacyLeads && legacyLeads.length > 0) {
        leads = legacyLeads.slice(campaign.sent_count, campaign.sent_count + batchSize);
      }
    }

    // Build recipients to send - NO RETRY logic, just pending recipients
    const recipientsToSend = filteredRecipients.length > 0 
      ? filteredRecipients.map(r => ({ 
          phone: r.phone, 
          name: r.name || undefined, 
          recipientId: r.id
        }))
      : leads.map(l => ({ phone: l.phone, name: l.name, recipientId: null }));

    if (recipientsToSend.length === 0) {
      // No pending recipients - campaign is done
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

      // Update campaign with accurate counts and mark as completed
      await supabase.from('campaigns').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        sent_count: campaign.total_recipients,
        delivered_count: totalSent || 0,
        failed_count: totalFailed || 0
      }).eq('id', campaignId);

      console.log(`[Batch] Campaign ${campaignId} completed: ${totalSent} delivered, ${totalFailed} failed`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          done: true, 
          status: 'completed',
          delivered: totalSent || 0,
          failed: totalFailed || 0,
          total: campaign.total_recipients
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentThisBatch = 0;
    let deliveredThisBatch = 0;
    let failedThisBatch = 0;

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
          sentThisBatch++;
          console.log(`[Batch] ✓ Sent to ${formattedPhone}`);

          // Update recipient status if we have the ID
          if (recipient.recipientId) {
            await supabase.from('campaign_recipients').update({
              status: 'sent',
              sent_at: new Date().toISOString()
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
            await supabase.from('conversation_assignments').insert({
              conversation_phone: formattedPhone,
              channel_id: channel.id,
              organization_id: campaign.organization_id,
              campaign_chatbot_id: campaign.chatbot_enabled && campaign.chatbot_id ? campaign.chatbot_id : null,
              is_bot_handling: campaign.chatbot_enabled && !!campaign.chatbot_id,
              status: 'archived', // Campaign dispatches start as archived
              sector_id: campaign.sector_id || null // Inherit sector from campaign
            });
          }
          console.log(`[Batch] Assignment created/updated for ${formattedPhone} with status: archived, sector: ${campaign.sector_id || 'none'}`);
        } else {
          // NO RETRY - Mark as failed immediately
          const errorCode = extractMetaErrorCode(result.error || '');
          failedThisBatch++;
          sentThisBatch++;
          console.log(`[Batch] ✗ Failed ${formattedPhone}: ${result.error}`);
          
          if (recipient.recipientId) {
            await supabase.from('campaign_recipients').update({
              status: 'failed',
              error_message: result.error || 'Erro desconhecido',
              last_error_code: errorCode || 'UNKNOWN'
            }).eq('id', recipient.recipientId);
          }
        }
      } catch (error) {
        failedThisBatch++;
        sentThisBatch++;
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

    // Check if there are remaining pending recipients
    // NOTE: Counters (sent_count, delivered_count, failed_count) are updated automatically
    // by the sync_campaign_counts trigger when campaign_recipients status changes
    const { count: remainingPending } = await supabase
      .from('campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

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

    const isComplete = (remainingPending || 0) === 0;

    // Only update status and completed_at - counters are managed by trigger
    await supabase.from('campaigns').update({
      status: isComplete ? 'completed' : 'running',
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq('id', campaignId);

    console.log(`[Batch] Campaign ${campaignId}: ${currentSent}/${totalRecipients} sent, ${currentDelivered} delivered, ${currentFailed} failed | Pending: ${remainingPending || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        done: isComplete,
        status: isComplete ? 'completed' : 'running',
        sent: currentSent,
        delivered: currentDelivered,
        failed: currentFailed,
        total: totalRecipients,
        batchProcessed: sentThisBatch
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