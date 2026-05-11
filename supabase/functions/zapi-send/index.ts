import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZAPI_BASE_URL = 'https://api.z-api.io';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
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

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Authentication failed:', authError?.message);
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
      console.log('Authenticated user:', userId);
    }

    const { 
      channelId, 
      destination, 
      message, 
      mediaType,
      mediaUrl,
      mediaCaption,
      fileName
    } = await req.json();

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !mediaUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem ou mídia são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials (for Z-API: app_name = Instance ID, access_token = Token)
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('provider', 'zapi')
      .single();

    if (channelError || !channel) {
      console.error('Z-API channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal Z-API não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Z-API configuradas (Instance ID e Token)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if user is a SuperAdmin (exempt from balance check)
    let isSuperAdmin = false;
    if (userId && userId !== 'service_role') {
      const { data: superAdminCheck } = await serviceRoleClient.rpc('is_super_admin', {
        _user_id: userId
      });
      isSuperAdmin = !!superAdminCheck;
    } else if (userId === 'service_role') {
      isSuperAdmin = true;
    }

    // Get message pricing
    const { data: pricing } = await serviceRoleClient
      .from('dispatch_pricing')
      .select('price_per_message')
      .eq('dispatch_type', 'service')
      .single();

    const pricePerMessage = pricing?.price_per_message ?? 0.008;

    // Balance check disabled - messages are now free
    // Note: Balance system still exists for subscriptions and store purchases
    if (channel.organization_id) {

      // Check if destination is blacklisted
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

    const instanceId = channel.app_name;
    const zapiToken = channel.access_token;
    const cleanDestination = destination.replace(/\D/g, '');

    const markAnswered = async () => {
      if (!externalSupabase || !channel.organization_id || !cleanDestination) return;
      const now = new Date().toISOString();
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: assignmentRows } = await externalSupabase
        .from('conversation_assignments')
        .select('id, assigned_to')
        .eq('organization_id', channel.organization_id)
        .eq('channel_id', channelId)
        .or(`conversation_phone.eq.${cleanDestination},conversation_phone.eq.+${cleanDestination}`)
        .limit(1);
      const assignment = assignmentRows?.[0];
      const humanUserId = userId && userId !== 'service_role' ? userId : null;
      if (assignment?.id) {
        const updates: Record<string, unknown> = { status: 'in_progress', is_bot_handling: false, bot_paused_until: botPausedUntil, updated_at: now };
        if (humanUserId && !assignment.assigned_to) {
          updates.assigned_to = humanUserId;
          updates.assigned_at = now;
        }
        await externalSupabase.from('conversation_assignments').update(updates).eq('id', assignment.id).eq('organization_id', channel.organization_id);
        await externalSupabase.from('conversation_stats').update({ unread_count: 0, updated_at: now }).eq('assignment_id', assignment.id).eq('organization_id', channel.organization_id);
      }
    };

    console.log('Sending WhatsApp message via Z-API:', {
      instanceId,
      destination: cleanDestination,
      hasMedia: !!mediaUrl,
      mediaType
    });

    let endpoint = '';
    let payload: Record<string, unknown> = { phone: cleanDestination };
    let storedContent = message || '';
    let storedMessageType = 'text';

    if (mediaUrl) {
      // Send media message
      switch (mediaType) {
        case 'image':
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-image`;
          payload = {
            phone: cleanDestination,
            image: mediaUrl,
            caption: mediaCaption || ''
          };
          storedContent = mediaCaption || '[Imagem]';
          storedMessageType = 'image';
          break;
        case 'video':
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-video`;
          payload = {
            phone: cleanDestination,
            video: mediaUrl,
            caption: mediaCaption || ''
          };
          storedContent = mediaCaption || '[Vídeo]';
          storedMessageType = 'video';
          break;
        case 'audio':
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-audio`;
          payload = {
            phone: cleanDestination,
            audio: mediaUrl
          };
          storedContent = '[Áudio]';
          storedMessageType = 'audio';
          break;
        case 'ptt':
        case 'voice':
          // PTT (Push-to-Talk) for voice messages - appears as voice message bubble
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-audio`;
          payload = {
            phone: cleanDestination,
            audio: mediaUrl,
            ptt: true // This flag makes it appear as a voice message
          };
          storedContent = '[Mensagem de voz]';
          storedMessageType = 'audio';
          break;
        case 'document':
        case 'file':
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-document`;
          payload = {
            phone: cleanDestination,
            document: mediaUrl,
            fileName: fileName || 'document'
          };
          storedContent = fileName || '[Documento]';
          storedMessageType = 'document';
          break;
        default:
          endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-document`;
          payload = {
            phone: cleanDestination,
            document: mediaUrl,
            fileName: fileName || 'file'
          };
          storedContent = fileName || '[Arquivo]';
          storedMessageType = 'file';
      }
    } else {
      // Send text message
      endpoint = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${zapiToken}/send-text`;
      payload = {
        phone: cleanDestination,
        message: message
      };
      storedContent = message;
      storedMessageType = 'text';
    }

    console.log('Z-API request:', endpoint, JSON.stringify(payload));

    const zapiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await zapiResponse.json();
    console.log('Z-API response:', zapiResponse.status, JSON.stringify(responseData));

    if (!zapiResponse.ok || responseData.error) {
      const errorMessage = responseData.error || responseData.message || 'Erro ao enviar mensagem via Z-API';
      console.error('Z-API error:', errorMessage);
      
      // Translate common Z-API error codes to user-friendly messages
      let friendlyError = errorMessage;
      if (typeof errorMessage === 'string') {
        if (errorMessage.includes('restricted') || errorMessage.includes('blocked')) {
          friendlyError = 'Conta com restrições. O WhatsApp restringiu o envio de mensagens desta conta.';
        } else if (errorMessage.includes('disconnected') || errorMessage.includes('desconectado')) {
          friendlyError = 'Canal desconectado. Reconecte o WhatsApp para continuar enviando.';
        } else if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
          friendlyError = 'Número de destino inválido ou não registrado no WhatsApp.';
        }
      }
      
      // Store failed message in database with error
      const failedMessageId = `zapi_failed_${Date.now()}`;
      const failedData = {
          channel_id: channelId,
          organization_id: channel.organization_id,
          message_id: failedMessageId,
          sender_phone: channel.phone,
          message_type: storedMessageType,
          content: storedContent,
          media_url: mediaUrl || null,
          direction: 'outbound',
          status: 'failed',
          error_message: friendlyError,
          metadata: { 
            destination: cleanDestination, 
            mediaType,
            fileName,
            provider: 'zapi',
            sent_by_human: userId !== 'service_role',
            originalError: errorMessage
          }
      };
      const msgDb = externalSupabase;
      await msgDb.from('whatsapp_messages').upsert(failedData, { onConflict: 'message_id', ignoreDuplicates: true });
      const _statsArgs1 = {
        _channel_id: channelId, _conversation_phone: cleanDestination,
        _content: storedContent, _direction: 'outbound', _is_read: null,
        _sender_name: null, _created_at: new Date().toISOString(),
      };
      if (externalSupabase) {
        externalSupabase.rpc('upsert_conversation_stats_external', _statsArgs1).then(() => {}, () => {});
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: friendlyError,
          details: responseData,
          messageId: failedMessageId
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageId = responseData.messageId || responseData.zapiMessageId || `zapi_out_${Date.now()}`;

    // Balance debit disabled - messages are now free
    // Note: Balance system still exists for subscriptions and store purchases
    console.log('Message sent successfully (no charge):', messageId);

    // Store outbound message in database
    const outboundData = {
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: messageId,
        sender_phone: channel.phone,
        message_type: storedMessageType,
        content: storedContent,
        media_url: mediaUrl || null,
        direction: 'outbound',
        status: 'sent',
        metadata: { 
          destination: cleanDestination, 
          mediaType,
          fileName,
          cost: pricePerMessage,
          provider: 'zapi',
          external_persisted_first: true,
          sent_by_human: userId !== 'service_role'
        }
    };
    const msgDb2 = externalSupabase;
    await msgDb2.from('whatsapp_messages').upsert(outboundData, { onConflict: 'message_id', ignoreDuplicates: true });
    // Update conversation stats manually (use internal UUID for stats)
    const msgDb2 = externalSupabase;
    await msgDb2.from('whatsapp_messages').upsert(outboundData, { onConflict: 'message_id', ignoreDuplicates: true });
    const _statsArgs2 = {
      _channel_id: channelId, _conversation_phone: cleanDestination,
      _content: storedContent, _direction: 'outbound', _is_read: null,
      _sender_name: null, _created_at: new Date().toISOString(),
    };
    if (externalSupabase) {
      externalSupabase.rpc('upsert_conversation_stats_external', _statsArgs2)
        .then(() => markAnswered(), () => {});
    }
    
    // Pause bot for 24 hours ONLY when a human sends a message (not service_role/bot)
    // This prevents the bot from responding while a human is handling the conversation
    if (userId !== 'service_role') {
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const caDb = externalSupabase;
      await caDb
        .from('conversation_assignments')
        .update({ 
          bot_paused_until: botPausedUntil,
          is_bot_handling: false,
          assigned_to: userId,
          assigned_at: new Date().toISOString()
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
        cost: pricePerMessage
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in zapi-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
