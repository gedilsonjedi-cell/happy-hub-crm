import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_API_VERSION = 'v18.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Mime type fallback order for audio retries
const AUDIO_MIME_FALLBACKS: { mimeType: string; filename: string }[] = [
  { mimeType: 'audio/ogg', filename: 'audio.ogg' },
  { mimeType: 'audio/opus', filename: 'audio.opus' },
  { mimeType: 'audio/mpeg', filename: 'audio.mp3' },
  { mimeType: 'audio/aac', filename: 'audio.aac' },
];

// Helper function to upload media to Meta and get media ID
async function uploadMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  mimeType: string,
  arrayBuffer?: ArrayBuffer
): Promise<{ mediaId: string | null; usedMimeType: string }> {
  try {
    console.log('Uploading media to Meta:', { mediaUrl, mimeType });
    
    // Download the media from the URL if not provided
    let buffer = arrayBuffer;
    if (!buffer) {
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        console.error('Failed to download media:', mediaResponse.status);
        return { mediaId: null, usedMimeType: mimeType };
      }
      const mediaBlob = await mediaResponse.blob();
      buffer = await mediaBlob.arrayBuffer();
    }
    
    // Create form data for Meta upload
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    
    // Determine filename based on mime type
    let filename = 'audio.ogg';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      filename = 'audio.m4a';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      filename = 'audio.mp3';
    } else if (mimeType === 'audio/opus') {
      filename = 'audio.opus';
    } else if (mimeType.includes('aac')) {
      filename = 'audio.aac';
    } else if (mimeType.includes('ogg')) {
      filename = 'audio.ogg';
    }
    
    console.log('Creating blob with:', { mimeType, filename });
    
    // Create a proper File/Blob for upload
    const file = new Blob([buffer], { type: mimeType });
    formData.append('file', file, filename);
    
    // Upload to Meta
    const uploadResponse = await fetch(
      `${META_API_BASE}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );
    
    const uploadText = await uploadResponse.text();
    console.log('Meta upload response:', uploadResponse.status, uploadText);
    
    if (!uploadResponse.ok) {
      console.error('Failed to upload media to Meta:', uploadText);
      return { mediaId: null, usedMimeType: mimeType };
    }
    
    const uploadResult = JSON.parse(uploadText);
    console.log('Media uploaded successfully, ID:', uploadResult.id);
    return { mediaId: uploadResult.id, usedMimeType: mimeType };
    
  } catch (error) {
    console.error('Error uploading media to Meta:', error);
    return { mediaId: null, usedMimeType: mimeType };
  }
}

// Helper function to upload audio with automatic retry using different mime types
async function uploadAudioWithRetry(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  initialMimeType: string
): Promise<{ mediaId: string | null; usedMimeType: string }> {
  console.log('Starting audio upload with retry logic:', { mediaUrl, initialMimeType });
  
  // First, download the media once to reuse
  let arrayBuffer: ArrayBuffer;
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error('Failed to download media:', mediaResponse.status);
      return { mediaId: null, usedMimeType: initialMimeType };
    }
    const mediaBlob = await mediaResponse.blob();
    arrayBuffer = await mediaBlob.arrayBuffer();
  } catch (error) {
    console.error('Error downloading media:', error);
    return { mediaId: null, usedMimeType: initialMimeType };
  }
  
  // Try initial mime type first
  let result = await uploadMediaToMeta(phoneNumberId, accessToken, mediaUrl, initialMimeType, arrayBuffer);
  if (result.mediaId) {
    console.log('Upload succeeded with initial mime type:', initialMimeType);
    return result;
  }
  
  // If initial failed, try fallback mime types
  console.log('Initial upload failed, trying fallback mime types...');
  for (const fallback of AUDIO_MIME_FALLBACKS) {
    if (fallback.mimeType === initialMimeType) continue; // Skip already tried
    
    console.log('Trying fallback mime type:', fallback.mimeType);
    result = await uploadMediaToMeta(phoneNumberId, accessToken, mediaUrl, fallback.mimeType, arrayBuffer);
    
    if (result.mediaId) {
      console.log('Upload succeeded with fallback mime type:', fallback.mimeType);
      return result;
    }
  }
  
  console.error('All mime type attempts failed');
  return { mediaId: null, usedMimeType: initialMimeType };
}

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
      fileName,
      campaignId
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

    // Fetch template content and buttons for metadata storage
    let templateContent: string | null = null;
    let templateButtons: unknown[] | null = null;
    
    if (templateName) {
      // Fetch template from database to store content in metadata
      const { data: templateData } = await serviceRoleClient
        .from('message_templates')
        .select('content, components')
        .eq('name', templateName)
        .eq('organization_id', channel.organization_id)
        .single();
      
      if (templateData) {
        templateContent = templateData.content;
        const comps = templateData.components as { buttons?: unknown[] } | null;
        templateButtons = comps?.buttons || null;
      }
      
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
        case 'ptt':
        case 'voice':
          // Check if the file is WebM format (not supported by WhatsApp)
          const isWebMFile = mediaUrl.toLowerCase().includes('.webm');
          
          if (isWebMFile) {
            console.error('WebM audio format is not supported by WhatsApp API');
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: 'Formato de áudio WebM não suportado pelo WhatsApp. Por favor, envie um arquivo de áudio no formato OGG, MP3 ou AAC.',
                details: 'Browser recordings in WebM format cannot be sent via WhatsApp API. Use the media upload feature with a supported audio file instead.',
                code: 'WEBM_NOT_SUPPORTED'
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // STRATEGY: Use direct link (URL) first - this is more stable in 2025
          // WhatsApp Cloud API can download directly from public URLs
          console.log('Processing audio message via direct link:', { mediaUrl });
          
          // Use direct link for audio - Meta will download from our storage
          messagePayload = {
            ...messagePayload,
            type: 'audio',
            audio: {
              link: mediaUrl
            }
          };
          
          console.log('Audio message configured with direct link (recommended approach)');
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
      const errorCode = responseData.error?.code || 'UNKNOWN_ERROR';
      console.error('Meta API error:', responseData.error);
      
      // Translate common Meta error codes to user-friendly messages
      let friendlyError = errorMessage;
      if (errorCode === 131031 || errorMessage.includes('restricted')) {
        friendlyError = 'Conta com restrições. O WhatsApp restringiu o envio de mensagens desta conta.';
      } else if (errorCode === 131047) {
        friendlyError = 'Limite de mensagens atingido. Aguarde antes de enviar mais mensagens.';
      } else if (errorCode === 131053) {
        friendlyError = 'Mídia inválida ou não suportada pelo WhatsApp.';
      } else if (errorCode === 130472) {
        friendlyError = 'Número de destino inválido ou não registrado no WhatsApp.';
      } else if (errorCode === 131051) {
        friendlyError = 'Formato de template incorreto ou parâmetros inválidos.';
      }
      
      // Store failed message in database with error
      const storedMessageType = templateName ? 'template' : (mediaUrl ? effectiveMediaType : 'text');
      const storedContent = templateName ? `Template: ${templateName}` : (message || (mediaUrl ? `[${effectiveMediaType || 'file'}]` : ''));
      
      const failedMessageId = `failed_${Date.now()}`;
      await serviceRoleClient
        .from('whatsapp_messages')
        .insert({
          channel_id: channelId,
          organization_id: channel.organization_id,
          message_id: failedMessageId,
          sender_phone: channel.phone,
          message_type: storedMessageType || 'text',
          content: storedContent,
          media_url: mediaUrl || null,
          direction: 'outbound',
          status: 'failed',
          error_message: friendlyError,
          metadata: { 
            destination: cleanDestination, 
            templateName, 
            templateParams,
            templateLanguage,
            templateContent,
            templateButtons,
            mediaType: effectiveMediaType,
            fileName,
            provider: 'meta',
            sent_by_human: userId !== 'service_role',
            campaignId: campaignId || null,
            originalError: errorMessage,
            errorCode: errorCode
          }
        });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: friendlyError,
          details: responseData.error,
          messageId: failedMessageId
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
          templateContent,
          templateButtons,
          mediaType: effectiveMediaType,
          fileName,
          cost: pricePerMessage,
          provider: 'meta',
          sent_by_human: userId !== 'service_role',
          campaignId: campaignId || null
        }
      });
    
    // Pause bot for 24 hours ONLY when a human sends a message (not service_role/bot)
    // This prevents the bot from responding while a human is handling the conversation
    if (userId !== 'service_role') {
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      await serviceRoleClient
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
    console.error('Error in meta-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
