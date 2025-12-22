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

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { channelId, destination, message, templateName, templateParams } = await req.json();

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !templateName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem ou template são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (channelError || !channel) {
      console.error('Channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais configuradas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending WhatsApp message via Gupshup:', {
      appName: channel.app_name,
      destination,
      hasTemplate: !!templateName
    });

    let gupshupResponse;
    const cleanDestination = destination.replace(/\D/g, '');

    if (templateName) {
      // Send template message
      const formData = new URLSearchParams();
      formData.append('channel', 'whatsapp');
      formData.append('source', channel.phone.replace(/\D/g, ''));
      formData.append('destination', cleanDestination);
      formData.append('src.name', channel.app_name);
      formData.append('template', JSON.stringify({
        id: templateName,
        params: templateParams || []
      }));

      gupshupResponse = await fetch(
        'https://api.gupshup.io/wa/api/v1/template/msg',
        {
          method: 'POST',
          headers: {
            'apikey': channel.access_token,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        }
      );
    } else {
      // Send session message (text)
      const formData = new URLSearchParams();
      formData.append('channel', 'whatsapp');
      formData.append('source', channel.phone.replace(/\D/g, ''));
      formData.append('destination', cleanDestination);
      formData.append('src.name', channel.app_name);
      formData.append('message', JSON.stringify({
        type: 'text',
        text: message
      }));

      gupshupResponse = await fetch(
        'https://api.gupshup.io/wa/api/v1/msg',
        {
          method: 'POST',
          headers: {
            'apikey': channel.access_token,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        }
      );
    }

    const responseText = await gupshupResponse.text();
    console.log('Gupshup response:', gupshupResponse.status, responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!gupshupResponse.ok || responseData.status === 'error') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: responseData.message || 'Erro ao enviar mensagem via Gupshup' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store outbound message in database
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const messageId = responseData.messageId || `out_${Date.now()}`;

    await serviceRoleClient
      .from('whatsapp_messages')
      .insert({
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: messageId,
        sender_phone: channel.phone,
        message_type: templateName ? 'template' : 'text',
        content: message || `Template: ${templateName}`,
        direction: 'outbound',
        status: 'sent',
        metadata: { destination: cleanDestination, templateName, templateParams }
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
        message: 'Mensagem enviada com sucesso!'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in gupshup-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
