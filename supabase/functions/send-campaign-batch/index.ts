import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const channelsMap = new Map(channels.map(c => [c.id, c]));
    const templatesMap = new Map(templates.map(t => [t.id, t]));

    // Get leads to send - skip already sent
    const { data: leads } = await supabase
      .from('leads')
      .select('phone, name, email, city, state, document, notes')
      .eq('organization_id', campaign.organization_id)
      .limit(campaign.total_recipients);

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No leads found', done: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the next batch to send
    const currentIndex = campaign.sent_count;
    const batchLeads = leads.slice(currentIndex, currentIndex + batchSize);

    if (batchLeads.length === 0) {
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

    let sentThisBatch = 0;
    let deliveredThisBatch = 0;
    let failedThisBatch = 0;

    // Process each lead in the batch
    for (const lead of batchLeads) {
      const idx = currentIndex + sentThisBatch;
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
        continue;
      }

      const formattedPhone = formatPhoneNumber(lead.phone);

      // Build template params
      const templateParams: string[] = [];
      if (template.variables && template.variables.length > 0) {
        for (const varName of template.variables) {
          const mapping = template.variable_mappings?.[varName] || 'manual';
          let value = varName;

          if (mapping === 'contact_first_name') {
            value = getFirstName(lead.name) || varName;
          } else if (variableFieldMap[mapping]) {
            const field = variableFieldMap[mapping] as keyof Recipient;
            value = String((lead as Recipient)[field] || varName);
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
          console.log(`[Batch] ✓ Sent to ${formattedPhone}`);

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
          failedThisBatch++;
          console.log(`[Batch] ✗ Failed ${formattedPhone}: ${result.error}`);
        }
      } catch (error) {
        failedThisBatch++;
        console.error(`[Batch] Error sending to ${formattedPhone}:`, error);
      }

      sentThisBatch++;
    }

    // Update campaign progress
    const newSentCount = campaign.sent_count + sentThisBatch;
    const newDeliveredCount = campaign.delivered_count + deliveredThisBatch;
    const newFailedCount = campaign.failed_count + failedThisBatch;
    const isComplete = newSentCount >= campaign.total_recipients;

    await supabase.from('campaigns').update({
      sent_count: newSentCount,
      delivered_count: newDeliveredCount,
      failed_count: newFailedCount,
      status: isComplete ? 'completed' : 'running',
      completed_at: isComplete ? new Date().toISOString() : null
    }).eq('id', campaignId);

    console.log(`[Batch] Campaign ${campaignId}: ${newSentCount}/${campaign.total_recipients}`);

    return new Response(
      JSON.stringify({
        success: true,
        done: isComplete,
        status: isComplete ? 'completed' : 'running',
        sent: newSentCount,
        delivered: newDeliveredCount,
        failed: newFailedCount,
        total: campaign.total_recipients,
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