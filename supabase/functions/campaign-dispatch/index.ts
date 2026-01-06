import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  'contact_name': 'name', // Legacy support
  'contact_full_name': 'name',
  'contact_phone': 'phone',
  'contact_email': 'email',
  'contact_city': 'city',
  'contact_state': 'state',
  'contact_document': 'document',
  'contact_notes': 'notes',
};

// Helper function to extract first name from full name
function getFirstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

// Generate random interval between min and max (in seconds)
function getRandomInterval(minSeconds: number, maxSeconds: number): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

// Sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Format phone number for WhatsApp API (remove non-digits, ensure country code)
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, remove it
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // If doesn't start with country code (55 for Brazil), add it
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

// Replace template variables with actual values from contact
function replaceVariables(
  content: string, 
  recipient: CampaignRecipient, 
  variableMappings: Record<string, string> | null,
  manualValues?: Record<string, string>
): string {
  let result = content;
  
  // Find all variables in the format *[VARIABLE]* or [VARIABLE]
  const regex = /\*?\[([A-Z_]+)\]\*?/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const varName = match[1];
    
    // Determine the value based on mapping
    let value = '';
    const mapping = variableMappings?.[varName] || 'manual';
    
    if (mapping === 'manual') {
      // Use manual value if provided
      value = manualValues?.[varName] || '';
    } else if (mapping === 'contact_first_name') {
      // Special handling for first name - extract from full name
      value = getFirstName(recipient.name);
    } else if (variableFieldMap[mapping]) {
      // Get value from contact field
      const field = variableFieldMap[mapping];
      value = String(recipient[field] || '');
    }
    
    // Replace the variable with the value
    if (value) {
      result = result.replace(fullMatch, value);
    }
  }
  
  return result;
}

// Max messages per batch to avoid timeout (edge function has ~60s limit)
// With 45-75 second intervals, we can only do ~1 message per minute
// So we process 10 messages per batch and then re-invoke
const BATCH_SIZE = 10;

// Background task to process campaign dispatch in batches
async function processCampaignDispatch(
  supabaseUrl: string,
  supabaseServiceKey: string,
  campaignId: string,
  recipients: Array<string | { phone: string }>,
  manualVariables?: Record<string, string>
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`[Background] Starting campaign dispatch for ${campaignId}`);
  
  try {
    // Fetch campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('[Background] Campaign not found:', campaignError);
      return;
    }

    // Check if campaign was paused or cancelled
    if (campaign.status === 'paused' || campaign.status === 'cancelled') {
      console.log(`[Background] Campaign ${campaignId} is ${campaign.status}, stopping`);
      return;
    }

    // Get min and max intervals (default to 5-120 seconds if not set)
    const minInterval = campaign.min_interval || 5;
    const maxInterval = campaign.max_interval || 120;

    console.log(`[Background] Campaign cadence: ${minInterval}s - ${maxInterval}s (random)`);

    // Fetch campaign channels with templates
    const { data: campaignChannels, error: channelsError } = await supabase
      .from('campaign_channels')
      .select('channel_id, template_id')
      .eq('campaign_id', campaignId)
      .order('order_index');

    if (channelsError || !campaignChannels || campaignChannels.length === 0) {
      console.error('[Background] No channels found for campaign:', channelsError);
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
      return;
    }

    // Get channel credentials
    const channelIds = campaignChannels.map(cc => cc.channel_id);
    const { data: channels, error: channelDetailsError } = await supabase
      .from('channels')
      .select('id, name, phone, access_token, organization_id')
      .in('id', channelIds);

    if (channelDetailsError || !channels) {
      console.error('[Background] Error fetching channel details:', channelDetailsError);
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
      return;
    }

    // Get templates content with variable mappings
    const templateIds = [...new Set(campaignChannels.map(cc => cc.template_id).filter(Boolean))];
    const { data: templates, error: templatesError } = await supabase
      .from('message_templates')
      .select('id, name, content, variables, variable_mappings')
      .in('id', templateIds);

    if (templatesError) {
      console.error('[Background] Error fetching templates:', templatesError);
    }

    const templatesMap = new Map<string, TemplateData>(templates?.map(t => [t.id, t as TemplateData]) || []);
    const channelsMap = new Map(channels.map(c => [c.id, c]));

    // Get phone numbers from recipients
    const phoneNumbers = recipients.map((r: string | { phone: string }) => 
      typeof r === 'string' ? r : r.phone
    );
    const formattedPhones = phoneNumbers.map(formatPhoneNumber);

    // Fetch lead data for these phone numbers to enrich with contact info
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, phone, name, email, city, state, document, notes, status')
      .or(formattedPhones.map(p => `phone.ilike.%${p.slice(-8)}`).join(','));

    // Create a map of phone -> lead data
    const leadsMap = new Map<string, CampaignRecipient>();
    if (leadsData) {
      for (const lead of leadsData) {
        const cleanPhone = formatPhoneNumber(lead.phone);
        leadsMap.set(cleanPhone, lead as CampaignRecipient);
      }
    }

    // Build recipients list with enriched data
    const campaignRecipients: CampaignRecipient[] = formattedPhones.map((phone, index) => {
      const leadData = leadsMap.get(phone);
      const originalRecipient = recipients[index];
      const recipientData = typeof originalRecipient === 'object' ? originalRecipient : {};
      
      return {
        id: leadData?.id || `temp_${index}`,
        phone,
        name: leadData?.name || (recipientData as { name?: string }).name || '',
        email: leadData?.email || '',
        city: leadData?.city || '',
        state: leadData?.state || '',
        document: leadData?.document || '',
        notes: leadData?.notes || '',
        status: leadData?.status || 'active'
      };
    });

    console.log(`[Background] Processing ${campaignRecipients.length} recipients`);
    console.log(`[Background] Found ${leadsData?.length || 0} matching leads for contact data`);

    // Get the starting point (in case of resume)
    const startIndex = campaign.sent_count || 0;
    let sentCount = startIndex;
    let deliveredCount = campaign.delivered_count || 0;
    let failedCount = campaign.failed_count || 0;
    
    // Channel index should cycle through channels based on recipient index, not sent count
    // This ensures all channels are used in rotation for each recipient

    // Calculate end of this batch
    const batchEnd = Math.min(startIndex + BATCH_SIZE, campaignRecipients.length);
    console.log(`[Background] Processing batch: ${startIndex + 1} to ${batchEnd} of ${campaignRecipients.length}`);

    // Process each recipient in this batch
    for (let i = startIndex; i < batchEnd; i++) {
      // Check if campaign was paused/cancelled before each message
      const { data: currentCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();
      
      if (currentCampaign?.status === 'paused' || currentCampaign?.status === 'cancelled') {
        console.log(`[Background] Campaign ${campaignId} is ${currentCampaign.status}, stopping at ${sentCount}/${campaignRecipients.length}`);
        return;
      }

      const recipient = campaignRecipients[i];
      
      // Get current channel - use recipient index to ensure round-robin across ALL channels
      const campaignChannel = campaignChannels[i % campaignChannels.length];
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id);

      if (!channel || !template) {
        console.error(`[Background] Missing channel or template for recipient ${recipient.phone}`);
        failedCount++;
        continue;
      }

      const formattedPhone = formatPhoneNumber(recipient.phone);
      
      // Replace variables in template content
      const processedContent = replaceVariables(
        template.content, 
        recipient, 
        template.variable_mappings,
        manualVariables
      );
      
      console.log(`[Background] [${i + 1}/${campaignRecipients.length}] Sending to ${formattedPhone} via channel ${channel.name}`);
      console.log(`[Background] Template: ${template.name}`);

      try {
        // Build templateParams array from variables
        const templateParams: string[] = [];
        if (template.variables && template.variables.length > 0) {
          for (const varName of template.variables) {
            const mapping = template.variable_mappings?.[varName] || 'manual';
            let value = '';
            
            if (mapping === 'manual') {
              value = manualVariables?.[varName] || varName;
            } else if (mapping === 'contact_first_name') {
              // Special handling for first name - extract from full name
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

        console.log(`[Background] Template params for ${formattedPhone}:`, templateParams);

        // Call meta-send edge function to actually send the message
        const metaSendResponse = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
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

        const metaSendResult = await metaSendResponse.json();
        
        console.log(`[Background] meta-send response status: ${metaSendResponse.status}`);
        
        if (metaSendResult.success) {
          sentCount++;
          deliveredCount++;
          console.log(`[Background] ✓ Message sent to ${formattedPhone} - Message ID: ${metaSendResult.messageId || 'N/A'}`);

          // If campaign has chatbot enabled and a custom chatbot, create/update conversation assignment
          if (campaign.chatbot_enabled && campaign.chatbot_id) {
            const { data: existingAssignment } = await supabase
              .from('conversation_assignments')
              .select('id')
              .eq('conversation_phone', formattedPhone)
              .eq('channel_id', channel.id)
              .single();

            if (existingAssignment) {
              // Update existing assignment with campaign chatbot
              await supabase
                .from('conversation_assignments')
                .update({ 
                  campaign_chatbot_id: campaign.chatbot_id,
                  is_bot_handling: true,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingAssignment.id);
            } else {
              // Create new assignment with campaign chatbot
              await supabase
                .from('conversation_assignments')
                .insert({
                  conversation_phone: formattedPhone,
                  channel_id: channel.id,
                  campaign_chatbot_id: campaign.chatbot_id,
                  is_bot_handling: true,
                  status: 'pending'
                });
            }
          }
        } else {
          failedCount++;
          const errorDetails = metaSendResult.details ? JSON.stringify(metaSendResult.details) : '';
          console.error(`[Background] ✗ Failed to send to ${formattedPhone}: ${metaSendResult.error || 'Unknown error'} ${errorDetails}`);
          
          // Store failed message in whatsapp_messages for debugging
          await supabase.from('whatsapp_messages').insert({
            channel_id: channel.id,
            organization_id: channel.organization_id,
            message_id: `failed_${Date.now()}_${formattedPhone}`,
            sender_phone: channel.phone,
            message_type: 'template',
            content: `Template: ${template.name}`,
            direction: 'outbound',
            status: 'failed',
            metadata: {
              destination: formattedPhone,
              error: metaSendResult.error,
              errorDetails: metaSendResult.details,
              campaignId: campaignId
            }
          });
        }

        // Update campaign progress
        await supabase
          .from('campaigns')
          .update({ 
            sent_count: sentCount,
            delivered_count: deliveredCount,
            failed_count: failedCount
          })
          .eq('id', campaignId);

      } catch (error) {
        console.error(`[Background] Error sending to ${formattedPhone}:`, error);
        failedCount++;
        
        // Update campaign progress even on error
        await supabase
          .from('campaigns')
          .update({ 
            sent_count: sentCount,
            delivered_count: deliveredCount,
            failed_count: failedCount
          })
          .eq('id', campaignId);
      }

      // Channel rotation is now handled by: campaignChannels[i % campaignChannels.length]

      // Wait random interval before next message (except for last one in batch)
      if (i < batchEnd - 1) {
        const randomInterval = getRandomInterval(minInterval, maxInterval);
        console.log(`[Background] ⏱ Waiting ${randomInterval} seconds before next dispatch...`);
        await sleep(randomInterval * 1000);
      }
    }

    // Check if there are more recipients to process
    if (batchEnd < campaignRecipients.length) {
      console.log(`[Background] Batch complete. Triggering next batch starting at ${batchEnd}...`);
      
      // Wait a short interval before starting next batch
      const batchInterval = getRandomInterval(minInterval, maxInterval);
      console.log(`[Background] ⏱ Waiting ${batchInterval} seconds before next batch...`);
      await sleep(batchInterval * 1000);
      
      // Re-invoke the function to continue with next batch
      try {
        const continueResponse = await fetch(`${supabaseUrl}/functions/v1/campaign-dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            campaignId: campaignId,
            action: 'continue',
            recipients: recipients, // Pass original recipients
            manualVariables: manualVariables
          }),
        });
        
        console.log(`[Background] Next batch triggered, status: ${continueResponse.status}`);
      } catch (continueError) {
        console.error('[Background] Failed to trigger next batch:', continueError);
        // Don't fail the campaign, let the user manually resume
      }
    } else {
      // All recipients processed - mark campaign as completed
      await supabase
        .from('campaigns')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          sent_count: sentCount,
          delivered_count: deliveredCount,
          failed_count: failedCount
        })
        .eq('id', campaignId);

      console.log(`[Background] Campaign ${campaignId} completed. Sent: ${sentCount}, Delivered: ${deliveredCount}, Failed: ${failedCount}`);
    }
    
  } catch (error) {
    console.error('[Background] Error in campaign dispatch:', error);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaignId, action, recipients: providedRecipients, manualVariables } = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a resume action (no recipients provided)
    let recipients = providedRecipients;
    
    if (!recipients || recipients.length === 0) {
      // Try to get campaign data to resume
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('*, campaign_channels(channel_id, template_id)')
        .eq('id', campaignId)
        .single();
      
      if (campaignError || !campaign) {
        return new Response(
          JSON.stringify({ error: 'Campaign not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Get the organization_id from campaign
      const orgId = campaign.organization_id;
      
      // Fetch all leads for this organization to use as recipients
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('phone')
        .eq('organization_id', orgId)
        .limit(campaign.total_recipients);
      
      if (leadsError || !leads || leads.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No recipients found for campaign resume' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      recipients = leads.map(l => l.phone);
      console.log(`Resuming campaign ${campaignId} with ${recipients.length} recipients from database`);
    }

    console.log(`Processing campaign ${campaignId} with action: ${action}`);
    console.log(`Total recipients: ${recipients.length}`);

    // Update campaign status to running immediately
    await supabase
      .from('campaigns')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString(),
        total_recipients: recipients.length 
      })
      .eq('id', campaignId);

    // Use EdgeRuntime.waitUntil to run the dispatch in background
    // This allows the function to return immediately while processing continues
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      console.log('Using EdgeRuntime.waitUntil for background processing');
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processCampaignDispatch(supabaseUrl, supabaseServiceKey, campaignId, recipients, manualVariables)
      );
    } else {
      // Fallback: run in background without waitUntil (may timeout for large campaigns)
      console.log('EdgeRuntime.waitUntil not available, running inline');
      // Don't await - let it run in background
      processCampaignDispatch(supabaseUrl, supabaseServiceKey, campaignId, recipients, manualVariables)
        .catch(err => console.error('Background dispatch error:', err));
    }

    // Return immediately with success
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Campaign dispatch started in background',
        campaignId,
        totalRecipients: recipients.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in campaign dispatch:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
