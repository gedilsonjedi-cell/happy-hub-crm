import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_API_VERSION = 'v18.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

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
    
    // Extract the token from the auth header
    const token = authHeader.replace('Bearer ', '');
    
    // Check if it's the service role key (used by campaign-dispatch and other internal functions)
    const isServiceRole = token === supabaseServiceKey;
    
    let supabase;
    let userId: string | null = null;
    
    if (isServiceRole) {
      // Service role access - create admin client
      console.log('Using service role authentication');
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      userId = 'service_role'; // Mark as service role
    } else {
      // User token access - validate the user
      // First try with the token as-is (for user JWTs)
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
      templateName, 
      templateParams,
      templateLanguage = 'pt_BR',
      mediaType,
      messageType,
      mediaUrl,
      mediaCaption,
      fileName
    } = await req.json();

    // Support both mediaType and messageType parameters
    const effectiveMediaType = mediaType || messageType;

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !templateName && !mediaUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem, template ou mídia são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    // For Meta API: access_token = Meta Access Token, app_name = Phone Number ID
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
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Meta configuradas (Access Token e Phone Number ID)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for balance operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if user is a SuperAdmin (exempt from balance check)
    // Skip for service role since it's used for campaigns
    let isSuperAdmin = false;
    if (userId && userId !== 'service_role') {
      const { data: superAdminCheck } = await serviceRoleClient.rpc('is_super_admin', {
        _user_id: userId
      });
      isSuperAdmin = !!superAdminCheck;
    } else if (userId === 'service_role') {
      // Service role is trusted, skip balance check for campaigns
      isSuperAdmin = true;
    }

    console.log('User/Role:', userId, 'Is SuperAdmin:', isSuperAdmin);

    // Get message pricing
    const { data: pricing } = await serviceRoleClient
      .from('dispatch_pricing')
      .select('price_per_message')
      .eq('dispatch_type', 'service')
      .single();

    const pricePerMessage = pricing?.price_per_message ?? 0.008;

    // Check organization balance before sending (skip for SuperAdmin)
    if (channel.organization_id && !isSuperAdmin) {
      const { data: hasBalance, error: balanceCheckError } = await serviceRoleClient.rpc(
        'check_organization_balance',
        {
          _organization_id: channel.organization_id,
          _amount: pricePerMessage
        }
      );

      if (balanceCheckError) {
        console.error('Error checking balance:', balanceCheckError);
      }

      if (!hasBalance) {
        console.log('Insufficient balance for organization:', channel.organization_id);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Saldo insuficiente para enviar mensagens. Por favor, recarregue seus créditos.',
            code: 'INSUFFICIENT_BALANCE'
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if destination is blacklisted
      const { data: isBlacklisted, error: blacklistError } = await serviceRoleClient.rpc(
        'is_phone_blacklisted',
        {
          _organization_id: channel.organization_id,
          _phone: destination.replace(/\D/g, '')
        }
      );

      if (blacklistError) {
        console.error('Error checking blacklist:', blacklistError);
      }

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

    const phoneNumberId = channel.app_name; // Phone Number ID from Meta
    const accessToken = channel.access_token;
    const cleanDestination = destination.replace(/\D/g, '');

    console.log('Sending WhatsApp message via Meta Cloud API:', {
      phoneNumberId,
      destination: cleanDestination,
      hasTemplate: !!templateName,
      hasMedia: !!mediaUrl,
      mediaType: effectiveMediaType,
      pricePerMessage
    });

    let messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanDestination
    };

    if (templateName) {
      // Send template message
      const components: unknown[] = [];
      
      if (templateParams && templateParams.length > 0) {
        components.push({
          type: 'body',
          parameters: templateParams.map((param: string) => ({
            type: 'text',
            text: param
          }))
        });
      }

      messagePayload = {
        ...messagePayload,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          ...(components.length > 0 && { components })
        }
      };
    } else if (mediaUrl) {
      // Send media message
      switch (effectiveMediaType) {
        case 'image':
          messagePayload = {
            ...messagePayload,
            type: 'image',
            image: {
              link: mediaUrl,
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'video':
          messagePayload = {
            ...messagePayload,
            type: 'video',
            video: {
              link: mediaUrl,
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'audio':
          messagePayload = {
            ...messagePayload,
            type: 'audio',
            audio: {
              link: mediaUrl
            }
          };
          break;
        case 'ptt':
        case 'voice':
          // Voice message (PTT) - requires audio to be in OGG/OPUS format
          // Check the file extension to determine if we can send as voice
          const isOggFormat = mediaUrl.toLowerCase().includes('.ogg') || 
                              mediaUrl.toLowerCase().includes('opus');
          
          if (isOggFormat) {
            // OGG format - can send as voice message (PTT)
            messagePayload = {
              ...messagePayload,
              type: 'audio',
              audio: {
                link: mediaUrl
              }
            };
            console.log('Sending as voice message (OGG format detected)');
          } else {
            // Non-OGG format (M4A, MP3, etc.) - send as regular audio file
            // WhatsApp only shows PTT waveform for OGG/OPUS files
            messagePayload = {
              ...messagePayload,
              type: 'audio',
              audio: {
                link: mediaUrl
              }
            };
            console.log('Sending as audio file (non-OGG format:', mediaUrl, ')');
          }
          break;
        case 'document':
        case 'file':
          messagePayload = {
            ...messagePayload,
            type: 'document',
            document: {
              link: mediaUrl,
              ...(fileName && { filename: fileName }),
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'sticker':
          messagePayload = {
            ...messagePayload,
            type: 'sticker',
            sticker: {
              link: mediaUrl
            }
          };
          break;
        default:
          messagePayload = {
            ...messagePayload,
            type: 'document',
            document: {
              link: mediaUrl,
              filename: fileName || 'file'
            }
          };
      }
    } else {
      // Send text message
      messagePayload = {
        ...messagePayload,
        type: 'text',
        text: {
          preview_url: true,
          body: message
        }
      };
    }

    console.log('Meta API payload:', JSON.stringify(messagePayload));

    const metaResponse = await fetch(
      `${META_API_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      }
    );

    const responseData = await metaResponse.json();
    console.log('Meta API response:', metaResponse.status, JSON.stringify(responseData));

    if (!metaResponse.ok || responseData.error) {
      const errorMessage = responseData.error?.message || 'Erro ao enviar mensagem via Meta API';
      console.error('Meta API error:', responseData.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: responseData.error
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageId = responseData.messages?.[0]?.id || `out_${Date.now()}`;

    // Message sent successfully - debit balance
    if (channel.organization_id) {
      const { data: debitSuccess, error: debitError } = await serviceRoleClient.rpc(
        'debit_organization_balance',
        {
          _organization_id: channel.organization_id,
          _amount: pricePerMessage,
          _description: `Mensagem WhatsApp enviada para ${cleanDestination}`,
          _reference_type: 'message',
          _reference_id: messageId
        }
      );

      if (debitError) {
        console.error('Error debiting balance:', debitError);
      } else {
        console.log('Balance debited successfully:', debitSuccess);
      }
    }

    // Determine content and message type for storage
    let storedContent = message || '';
    let storedMessageType = 'text';

    if (templateName) {
      storedContent = `Template: ${templateName}`;
      storedMessageType = 'template';
    } else if (mediaUrl) {
      storedContent = mediaCaption || `[${effectiveMediaType || 'file'}]`;
      storedMessageType = effectiveMediaType === 'ptt' || effectiveMediaType === 'voice' ? 'audio' : (effectiveMediaType || 'file');
    }

    // Store outbound message in database
    await serviceRoleClient
      .from('whatsapp_messages')
      .insert({
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
          templateName, 
          templateParams,
          templateLanguage,
          mediaType: effectiveMediaType,
          fileName,
          cost: pricePerMessage,
          provider: 'meta'
        }
      });

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
    console.error('Error in meta-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
