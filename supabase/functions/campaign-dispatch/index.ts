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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaignId, action, recipients, manualVariables } = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Recipients list is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing campaign ${campaignId} with action: ${action}`);

    // Fetch campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('Campaign not found:', campaignError);
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get min and max intervals (default to 5-120 seconds if not set)
    const minInterval = campaign.min_interval || 5;
    const maxInterval = campaign.max_interval || 120;

    console.log(`Campaign cadence: ${minInterval}s - ${maxInterval}s (random)`);

    // Fetch campaign channels with templates
    const { data: campaignChannels, error: channelsError } = await supabase
      .from('campaign_channels')
      .select('channel_id, template_id')
      .eq('campaign_id', campaignId)
      .order('order_index');

    if (channelsError || !campaignChannels || campaignChannels.length === 0) {
      console.error('No channels found for campaign:', channelsError);
      return new Response(
        JSON.stringify({ error: 'No channels configured for campaign' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    const channelIds = campaignChannels.map(cc => cc.channel_id);
    const { data: channels, error: channelDetailsError } = await supabase
      .from('channels')
      .select('id, name, phone, access_token, organization_id')
      .in('id', channelIds);

    if (channelDetailsError || !channels) {
      console.error('Error fetching channel details:', channelDetailsError);
      return new Response(
        JSON.stringify({ error: 'Error fetching channel details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get templates content with variable mappings
    const templateIds = [...new Set(campaignChannels.map(cc => cc.template_id).filter(Boolean))];
    const { data: templates, error: templatesError } = await supabase
      .from('message_templates')
      .select('id, name, content, variables, variable_mappings')
      .in('id', templateIds);

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
    }

    const templatesMap = new Map<string, TemplateData>(templates?.map(t => [t.id, t as TemplateData]) || []);
    const channelsMap = new Map(channels.map(c => [c.id, c]));

    // Get phone numbers from recipients
    const phoneNumbers = recipients.map((r: string | { phone: string }) => 
      typeof r === 'string' ? r : r.phone
    );
    const formattedPhones = phoneNumbers.map(formatPhoneNumber);

    // Try to find leads by phone to get additional contact info
    const { data: leadsData } = await supabase
      .from('leads')
      .select('phone, name, email, city, state, document, notes')
      .or(phoneNumbers.map((p: string) => `phone.ilike.%${p.replace(/\D/g, '').slice(-9)}%`).join(','));

    // Create a map of phone to lead data
    type LeadData = { phone: string; name: string | null; email: string | null; city: string | null; state: string | null; document: string | null; notes: string | null };
    const leadsMap = new Map<string, LeadData>();
    if (leadsData) {
      leadsData.forEach(lead => {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        leadsMap.set(cleanPhone, lead);
        // Also map last 9 digits for matching
        if (cleanPhone.length >= 9) {
          leadsMap.set(cleanPhone.slice(-9), lead);
        }
      });
    }

    // Build recipients with contact data
    const campaignRecipients: CampaignRecipient[] = phoneNumbers.map((phone: string, index: number) => {
      const cleanPhone = phone.replace(/\D/g, '');
      const lead = leadsMap.get(cleanPhone) || leadsMap.get(cleanPhone.slice(-9));
      
      return {
        id: String(index + 1),
        phone: phone,
        name: lead?.name,
        email: lead?.email || undefined,
        city: lead?.city || undefined,
        state: lead?.state || undefined,
        document: lead?.document || undefined,
        notes: lead?.notes || undefined,
        status: 'pending'
      };
    });

    console.log(`Processing ${campaignRecipients.length} recipients`);
    console.log(`Found ${leadsData?.length || 0} matching leads for contact data`);

    // Update campaign status to running
    await supabase
      .from('campaigns')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString(),
        total_recipients: campaignRecipients.length 
      })
      .eq('id', campaignId);

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let currentChannelIndex = 0;

    // Process each recipient with random intervals
    for (let i = 0; i < campaignRecipients.length; i++) {
      const recipient = campaignRecipients[i];
      
      // Get current channel (alternate between channels)
      const campaignChannel = campaignChannels[currentChannelIndex % campaignChannels.length];
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id);

      if (!channel || !template) {
        console.error(`Missing channel or template for recipient ${recipient.phone}`);
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
      
      console.log(`Sending to ${formattedPhone} via channel ${channel.name}`);
      console.log(`Template: ${template.name}`);
      console.log(`Processed content preview: ${processedContent.substring(0, 100)}...`);

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

        console.log(`Template params for ${formattedPhone}:`, templateParams);

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
            templateLanguage: 'pt_BR'
          }),
        });

        const metaSendResult = await metaSendResponse.json();
        
        console.log(`meta-send response status: ${metaSendResponse.status}`);
        console.log(`meta-send response body:`, JSON.stringify(metaSendResult));
        
        if (metaSendResult.success) {
          sentCount++;
          deliveredCount++;
          console.log(`✓ Message sent to ${formattedPhone} - Message ID: ${metaSendResult.messageId || 'N/A'}`);
        } else {
          failedCount++;
          const errorDetails = metaSendResult.details ? JSON.stringify(metaSendResult.details) : '';
          console.error(`✗ Failed to send to ${formattedPhone}: ${metaSendResult.error || 'Unknown error'} ${errorDetails}`);
          
          // Store failed message in whatsapp_messages for debugging
          const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          );
          await serviceClient.from('whatsapp_messages').insert({
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
        console.error(`Error sending to ${formattedPhone}:`, error);
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

      // Move to next channel for interleaved dispatch
      currentChannelIndex++;

      // Wait random interval before next message (except for last one)
      if (i < campaignRecipients.length - 1) {
        const randomInterval = getRandomInterval(minInterval, maxInterval);
        console.log(`⏱ Waiting ${randomInterval} seconds before next dispatch...`);
        await sleep(randomInterval * 1000);
      }
    }

    // Update campaign as completed
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

    console.log(`Campaign ${campaignId} completed. Sent: ${sentCount}, Delivered: ${deliveredCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Campaign dispatch completed',
        stats: {
          total: campaignRecipients.length,
          sent: sentCount,
          delivered: deliveredCount,
          failed: failedCount
        }
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
