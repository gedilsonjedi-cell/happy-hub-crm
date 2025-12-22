import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET request for webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = url.searchParams.get('hub.verify_token');
    
    console.log('Webhook verification request:', { challenge, verifyToken });
    
    // Return the challenge for webhook verification
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
    
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    console.log('Gupshup webhook received:', JSON.stringify(body));

    // Gupshup sends different payload formats
    // Handle message events
    if (body.type === 'message' || body.payload?.type === 'message') {
      const payload = body.payload || body;
      const messageData = payload.payload || payload;
      
      const senderPhone = messageData.source || messageData.sender?.phone || body.mobile;
      const messageContent = messageData.text || messageData.payload?.text || messageData.body || '';
      const messageType = messageData.type || 'text';
      const messageId = body.messageId || body.id || `msg_${Date.now()}`;
      const appName = body.app || body.appName || '';
      const senderName = messageData.sender?.name || messageData.name || '';

      console.log('Processing incoming message:', {
        senderPhone,
        messageContent,
        messageType,
        messageId,
        appName,
        senderName
      });

      // Find the channel by app_name
      const { data: channel, error: channelError } = await supabase
        .from('channels')
        .select('id, organization_id')
        .eq('app_name', appName)
        .eq('provider', 'gupshup')
        .eq('connected', true)
        .single();

      if (channelError || !channel) {
        console.log('Channel not found for app:', appName);
        // Try to find by phone number
        const { data: channelByPhone } = await supabase
          .from('channels')
          .select('id, organization_id')
          .eq('provider', 'gupshup')
          .eq('connected', true)
          .limit(1)
          .single();
        
        if (!channelByPhone) {
          console.log('No matching channel found');
          return new Response(
            JSON.stringify({ status: 'ok', message: 'No channel configured' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const channelId = channel?.id;
      const organizationId = channel?.organization_id;

      // Store the incoming message
      const { error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          channel_id: channelId,
          organization_id: organizationId,
          message_id: messageId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_type: messageType,
          content: messageContent,
          direction: 'inbound',
          status: 'received',
          metadata: body
        });

      if (insertError) {
        console.error('Error storing message:', insertError);
      } else {
        console.log('Message stored successfully');
      }

      // Check if sender is a lead, if not create one
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', senderPhone)
        .single();

      if (!existingLead && organizationId) {
        // Get first admin user of the organization to assign the lead
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('organization_id', organizationId)
          .limit(1)
          .single();

        if (adminProfile) {
          const { error: leadError } = await supabase
            .from('leads')
            .insert({
              user_id: adminProfile.user_id,
              organization_id: organizationId,
              name: senderName || `Lead ${senderPhone.slice(-4)}`,
              phone: senderPhone,
              status: 'new',
              notes: 'Lead criado automaticamente via WhatsApp'
            });

          if (leadError) {
            console.error('Error creating lead:', leadError);
          } else {
            console.log('New lead created for:', senderPhone);
          }
        }
      }
    }

    // Handle message status updates
    if (body.type === 'message-event' || body.eventType) {
      const status = body.eventType || body.type;
      const messageId = body.messageId || body.externalId;
      
      console.log('Message status update:', { status, messageId });

      if (messageId) {
        const { error: updateError } = await supabase
          .from('whatsapp_messages')
          .update({ status: status.toLowerCase() })
          .eq('message_id', messageId);

        if (updateError) {
          console.error('Error updating message status:', updateError);
        }
      }
    }

    return new Response(
      JSON.stringify({ status: 'ok' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ status: 'error', message: errorMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
