import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CampaignRecipient {
  id: string;
  phone: string;
  name?: string;
  status: string;
}

interface CampaignChannel {
  channel_id: string;
  template_id: string;
}

// Generate random interval between min and max (in seconds)
function getRandomInterval(minSeconds: number, maxSeconds: number): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

// Sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    const { campaignId, action } = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
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

    // Get templates content
    const templateIds = [...new Set(campaignChannels.map(cc => cc.template_id).filter(Boolean))];
    const { data: templates, error: templatesError } = await supabase
      .from('message_templates')
      .select('id, name, content, variables')
      .in('id', templateIds);

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
    }

    const templatesMap = new Map(templates?.map(t => [t.id, t]) || []);
    const channelsMap = new Map(channels.map(c => [c.id, c]));

    // For demo purposes, we'll simulate recipients
    // In production, this would come from a leads table or uploaded list
    const demoRecipients: CampaignRecipient[] = [
      { id: '1', phone: '5511999999991', name: 'Cliente 1', status: 'pending' },
      { id: '2', phone: '5511999999992', name: 'Cliente 2', status: 'pending' },
      { id: '3', phone: '5511999999993', name: 'Cliente 3', status: 'pending' },
      { id: '4', phone: '5511999999994', name: 'Cliente 4', status: 'pending' },
      { id: '5', phone: '5511999999995', name: 'Cliente 5', status: 'pending' },
    ];

    // Update campaign status to running
    await supabase
      .from('campaigns')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString(),
        total_recipients: demoRecipients.length 
      })
      .eq('id', campaignId);

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let currentChannelIndex = 0;

    // Process each recipient with random intervals
    for (let i = 0; i < demoRecipients.length; i++) {
      const recipient = demoRecipients[i];
      
      // Get current channel (alternate between channels)
      const campaignChannel = campaignChannels[currentChannelIndex % campaignChannels.length];
      const channel = channelsMap.get(campaignChannel.channel_id);
      const template = templatesMap.get(campaignChannel.template_id);

      if (!channel || !template) {
        console.error(`Missing channel or template for recipient ${recipient.phone}`);
        failedCount++;
        continue;
      }

      console.log(`Sending to ${recipient.phone} via channel ${channel.name}`);
      console.log(`Template: ${template.name}`);

      // Replace variables in template content
      let messageContent = template.content;
      if (recipient.name) {
        messageContent = messageContent.replace(/\{\{nome\}\}/gi, recipient.name);
        messageContent = messageContent.replace(/\{\{name\}\}/gi, recipient.name);
      }

      try {
        // In production, this would call the meta-send edge function
        // For now, we simulate the send
        const sendSuccess = Math.random() > 0.1; // 90% success rate simulation

        if (sendSuccess) {
          sentCount++;
          deliveredCount++;
          console.log(`✓ Message sent to ${recipient.phone}`);
        } else {
          failedCount++;
          console.log(`✗ Failed to send to ${recipient.phone}`);
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
        console.error(`Error sending to ${recipient.phone}:`, error);
        failedCount++;
      }

      // Move to next channel for interleaved dispatch
      currentChannelIndex++;

      // Wait random interval before next message (except for last one)
      if (i < demoRecipients.length - 1) {
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
          total: demoRecipients.length,
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
