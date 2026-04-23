import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GUPSHUP_API_BASE = 'https://api.gupshup.io/wa/api/v1/msg';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // External DB — messages go here exclusively
    const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let supabase;
    let userId: string | null = null;

    if (isServiceRole) {
      console.log('Using service role authentication');
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      userId = 'service_role';
    } else {
      supabase = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        userId = user.id;
      } else {
        userId = claimsData.claims.sub as string;
      }
      console.log('Authenticated user:', userId);
    }

    const {
      channelId,
      destination,
      message,
      messageType,
      mediaUrl,
      mediaCaption,
      fileName,
      templateName,
      templateParams,
    } = await req.json();

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !mediaUrl && messageType !== 'template') {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem ou mídia são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    // For Gupshup: access_token = API Key, app_name = App Name (src.name), phone = source number
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: channel, error: channelError } = await serviceRoleClient
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('provider', 'gupshup')
      .single();

    if (channelError || !channel) {
      console.error('Gupshup channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal Gupshup não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Gupshup configuradas (API Key e App Name)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check blacklist
    if (channel.organization_id) {
      const { data: isBlacklisted } = await serviceRoleClient.rpc(
        'is_phone_blacklisted',
        {
          _organization_id: channel.organization_id,
          _phone: destination.replace(/\D/g, '')
        }
      );

      if (isBlacklisted) {
        console.log('Destination is blacklisted:', destination);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Este contato está na lista negra e não pode receber mensagens.',
            code: 'BLACKLISTED'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const gupshupApiKey = channel.access_token;
    const appName = channel.app_name; // src.name
    const sourcePhone = channel.phone.replace(/\D/g, '');
    const cleanDestination = destination.replace(/\D/g, '');

    console.log('Sending WhatsApp message via Gupshup:', {
      appName,
      sourcePhone,
      destination: cleanDestination,
      hasMedia: !!mediaUrl,
      messageType: messageType || 'text',
    });

    // Build Gupshup message payload
    let gupshupMessage: Record<string, unknown>;
    let storedContent = message || '';
    let storedMessageType = 'text';

    if (messageType === 'template' && templateName) {
      // Template message
      gupshupMessage = {
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          ...(templateParams && templateParams.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: templateParams.map((p: string) => ({ type: 'text', text: p })),
                  },
                ],
              }
            : {}),
        },
      };
      storedContent = `[Template: ${templateName}]`;
      storedMessageType = 'template';
    } else if (mediaUrl) {
      // Media message
      switch (messageType) {
        case 'image':
          gupshupMessage = {
            type: 'image',
            originalUrl: mediaUrl,
            caption: mediaCaption || '',
            previewUrl: mediaUrl,
          };
          storedContent = mediaCaption || '[Imagem]';
          storedMessageType = 'image';
          break;
        case 'video':
          gupshupMessage = {
            type: 'video',
            url: mediaUrl,
            caption: mediaCaption || '',
          };
          storedContent = mediaCaption || '[Vídeo]';
          storedMessageType = 'video';
          break;
        case 'audio':
        case 'ptt':
        case 'voice':
          gupshupMessage = {
            type: 'audio',
            url: mediaUrl,
          };
          storedContent = '[Áudio]';
          storedMessageType = 'audio';
          break;
        case 'document':
        case 'file':
          gupshupMessage = {
            type: 'file',
            url: mediaUrl,
            filename: fileName || 'document',
          };
          storedContent = fileName || '[Documento]';
          storedMessageType = 'document';
          break;
        default:
          gupshupMessage = {
            type: 'file',
            url: mediaUrl,
            filename: fileName || 'file',
          };
          storedContent = fileName || '[Arquivo]';
          storedMessageType = 'file';
      }
    } else {
      // Text message
      gupshupMessage = {
        type: 'text',
        text: message,
      };
      storedContent = message;
      storedMessageType = 'text';
    }

    // Send via Gupshup API (application/x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append('channel', 'whatsapp');
    formData.append('source', sourcePhone);
    formData.append('src.name', appName);
    formData.append('destination', cleanDestination);
    formData.append('message', JSON.stringify(gupshupMessage));

    console.log('Gupshup request:', GUPSHUP_API_BASE, formData.toString());

    const gupshupResponse = await fetch(GUPSHUP_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': gupshupApiKey,
      },
      body: formData.toString(),
    });

    const responseText = await gupshupResponse.text();
    console.log('Gupshup response:', gupshupResponse.status, responseText);

    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!gupshupResponse.ok || responseData.status === 'error') {
      const errorMessage = (responseData.message as string) || responseText || 'Erro ao enviar mensagem via Gupshup';
      console.error('Gupshup error:', errorMessage);

      // Store failed message
      const failedMessageId = `gupshup_failed_${Date.now()}`;
      const failedData = {
          channel_id: channelId,
          organization_id: channel.organization_id,
          message_id: failedMessageId,
          sender_phone: sourcePhone,
          message_type: storedMessageType,
          content: storedContent,
          media_url: mediaUrl || null,
          direction: 'outbound',
          status: 'failed',
          error_message: errorMessage,
          metadata: {
            destination: cleanDestination,
            mediaType: messageType,
            fileName,
            provider: 'gupshup',
            sent_by_human: userId !== 'service_role',
            originalError: responseText,
          },
      };
      const msgDb = externalSupabase || serviceRoleClient;
      await msgDb.from('whatsapp_messages').upsert(failedData, { onConflict: 'message_id', ignoreDuplicates: true });
      serviceRoleClient.rpc('upsert_conversation_stats_manual', {
        _channel_id: channelId, _conversation_phone: cleanDestination,
        _content: storedContent, _direction: 'outbound', _is_read: null,
        _sender_name: null, _created_at: new Date().toISOString(),
      }).then(() => {}).catch(() => {});

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: responseData,
          messageId: failedMessageId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageId = (responseData.messageId as string) || `gupshup_out_${Date.now()}`;
    console.log('Message sent successfully via Gupshup:', messageId);

    // Store outbound message
    const outboundData = {
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: messageId,
        sender_phone: sourcePhone,
        message_type: storedMessageType,
        content: storedContent,
        media_url: mediaUrl || null,
        direction: 'outbound',
        status: 'sent',
        metadata: {
          destination: cleanDestination,
          mediaType: messageType,
          fileName,
          provider: 'gupshup',
          external_persisted_first: true,
          sent_by_human: userId !== 'service_role',
        },
    };
    const msgDb2 = externalSupabase || serviceRoleClient;
    await msgDb2.from('whatsapp_messages').upsert(outboundData, { onConflict: 'message_id', ignoreDuplicates: true });
    serviceRoleClient.rpc('upsert_conversation_stats_manual', {
      _channel_id: channelId, _conversation_phone: cleanDestination,
      _content: storedContent, _direction: 'outbound', _is_read: null,
      _sender_name: null, _created_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    // Pause bot for 24 hours when a human sends a message
    if (userId !== 'service_role') {
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await serviceRoleClient
        .from('conversation_assignments')
        .update({
          bot_paused_until: botPausedUntil,
          is_bot_handling: false,
          assigned_to: userId,
          assigned_at: new Date().toISOString(),
        })
        .eq('channel_id', channelId)
        .eq('conversation_phone', cleanDestination);

      console.log('Bot paused for 24 hours for conversation with:', cleanDestination);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId,
        message: 'Mensagem enviada com sucesso!',
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
