import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// External DB for high-volume tables
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

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

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let supabase;
    let userId: string | null = null;

    if (isServiceRole) {
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      userId = 'service_role';
    } else {
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
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
    // For Infobip: access_token = API Key, app_name = Base URL, waba_id = sender number
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);
    const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

    const { data: channel, error: channelError } = await serviceRoleClient
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('provider', 'infobip')
      .single();

    if (channelError || !channel) {
      console.error('Infobip channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal Infobip não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Infobip configuradas (API Key e Base URL)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check blacklist
    if (channel.organization_id) {
      const { data: isBlacklisted } = await serviceRoleClient.rpc(
        'is_phone_blacklisted',
        {
          _organization_id: channel.organization_id,
          _phone: destination.replace(/\D/g, ''),
        }
      );

      if (isBlacklisted) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Este contato está na lista negra e não pode receber mensagens.',
            code: 'BLACKLISTED',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const infobipApiKey = channel.access_token;
    const infobipBaseUrl = channel.app_name; // e.g. v33p8m.api.infobip.com
    const senderPhone = (channel.waba_id || channel.phone).replace(/\D/g, '');
    const cleanDestination = destination.replace(/\D/g, '');

    console.log('Sending WhatsApp message via Infobip:', {
      baseUrl: infobipBaseUrl,
      senderPhone,
      destination: cleanDestination,
      messageType: messageType || 'text',
    });

    let infobipEndpoint: string;
    let infobipPayload: Record<string, unknown>;
    let storedContent = message || '';
    let storedMessageType = 'text';

    if (messageType === 'template' && templateName) {
      // Template message
      infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/template`;
      const templateBody: Record<string, unknown> = {
        templateName: templateName,
        language: 'pt_BR',
      };

      if (templateParams && templateParams.length > 0) {
        templateBody.body = {
          placeholders: templateParams,
        };
      }

      infobipPayload = {
        messages: [{
          from: senderPhone,
          to: cleanDestination,
          content: {
            templateName: templateName,
            templateData: templateBody,
            language: 'pt_BR',
          },
        }],
      };
      storedContent = `[Template: ${templateName}]`;
      storedMessageType = 'template';
    } else if (mediaUrl) {
      // Media messages
      switch (messageType) {
        case 'image':
          infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/image`;
          infobipPayload = {
            messages: [{
              from: senderPhone,
              to: cleanDestination,
              content: {
                mediaUrl: mediaUrl,
                caption: mediaCaption || '',
              },
            }],
          };
          storedContent = mediaCaption || '[Imagem]';
          storedMessageType = 'image';
          break;
        case 'video':
          infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/video`;
          infobipPayload = {
            messages: [{
              from: senderPhone,
              to: cleanDestination,
              content: {
                mediaUrl: mediaUrl,
                caption: mediaCaption || '',
              },
            }],
          };
          storedContent = mediaCaption || '[Vídeo]';
          storedMessageType = 'video';
          break;
        case 'audio':
        case 'ptt':
        case 'voice':
          infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/audio`;
          infobipPayload = {
            messages: [{
              from: senderPhone,
              to: cleanDestination,
              content: {
                mediaUrl: mediaUrl,
              },
            }],
          };
          storedContent = '[Áudio]';
          storedMessageType = 'audio';
          break;
        case 'document':
        case 'file':
          infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/document`;
          infobipPayload = {
            messages: [{
              from: senderPhone,
              to: cleanDestination,
              content: {
                mediaUrl: mediaUrl,
                caption: mediaCaption || '',
                filename: fileName || 'document',
              },
            }],
          };
          storedContent = fileName || '[Documento]';
          storedMessageType = 'document';
          break;
        default:
          infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/document`;
          infobipPayload = {
            messages: [{
              from: senderPhone,
              to: cleanDestination,
              content: {
                mediaUrl: mediaUrl,
                filename: fileName || 'file',
              },
            }],
          };
          storedContent = fileName || '[Arquivo]';
          storedMessageType = 'file';
      }
    } else {
      // Text message
      infobipEndpoint = `https://${infobipBaseUrl}/whatsapp/1/message/text`;
      infobipPayload = {
        messages: [{
          from: senderPhone,
          to: cleanDestination,
          content: {
            text: message,
          },
        }],
      };
      storedContent = message;
      storedMessageType = 'text';
    }

    console.log('Infobip request:', infobipEndpoint);

    const infobipResponse = await fetch(infobipEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `App ${infobipApiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(infobipPayload),
    });

    const responseText = await infobipResponse.text();
    console.log('Infobip response:', infobipResponse.status, responseText);

    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!infobipResponse.ok) {
      const errorMessage = extractInfobipError(responseData) || responseText || 'Erro ao enviar mensagem via Infobip';
      console.error('Infobip error:', errorMessage);

      // Store failed message
      const failedMessageId = `infobip_failed_${Date.now()}`;
      const failedData = {
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: failedMessageId,
        sender_phone: senderPhone,
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
          provider: 'infobip',
          sent_by_human: userId !== 'service_role',
          originalError: responseText,
        },
      };

      await serviceRoleClient.from('whatsapp_messages').insert(failedData);
      if (externalSupabase) {
        externalSupabase.from('whatsapp_messages').insert(failedData).then(() => {}).catch(() => {});
      }

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

    // Extract message ID from Infobip response
    const messages = (responseData as any)?.messages;
    const messageId = messages?.[0]?.messageId || `infobip_out_${Date.now()}`;
    console.log('Message sent successfully via Infobip:', messageId);

    // Store outbound message
    const successData = {
      channel_id: channelId,
      organization_id: channel.organization_id,
      message_id: messageId,
      sender_phone: senderPhone,
      message_type: storedMessageType,
      content: storedContent,
      media_url: mediaUrl || null,
      direction: 'outbound',
      status: 'sent',
      metadata: {
        destination: cleanDestination,
        mediaType: messageType,
        fileName,
        provider: 'infobip',
        sent_by_human: userId !== 'service_role',
      },
    };

    await serviceRoleClient.from('whatsapp_messages').insert(successData);
    if (externalSupabase) {
      externalSupabase.from('whatsapp_messages').insert(successData).then(() => {}).catch(() => {});
    }

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
    console.error('Error in infobip-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractInfobipError(responseData: Record<string, unknown>): string | null {
  try {
    const requestError = responseData?.requestError as Record<string, unknown>;
    if (requestError) {
      const serviceException = requestError.serviceException as Record<string, unknown>;
      if (serviceException) {
        return (serviceException.text as string) || (serviceException.messageId as string) || null;
      }
    }
    // Check messages array for errors
    const messages = (responseData as any)?.messages;
    if (messages?.[0]?.status?.description) {
      return messages[0].status.description;
    }
    return null;
  } catch {
    return null;
  }
}
