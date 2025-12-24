import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      // Find channel with this verify token
      const { data: channel, error } = await supabase
        .from('channels')
        .select('id')
        .eq('webhook_verify_token', token)
        .eq('provider', 'meta')
        .single();
      
      if (channel && !error) {
        console.log('Webhook verified for channel:', channel.id);
        return new Response(challenge, { status: 200 });
      } else {
        console.error('Invalid verify token');
        return new Response('Forbidden', { status: 403 });
      }
    } else {
      console.error('Missing verification parameters');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook events (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Meta webhook received:', JSON.stringify(body, null, 2));

      // Meta sends events in this structure
      const entry = body.entry?.[0];
      if (!entry) {
        console.log('No entry in webhook payload');
        return new Response('OK', { status: 200 });
      }

      const changes = entry.changes?.[0];
      if (!changes || changes.field !== 'messages') {
        console.log('Not a messages webhook, field:', changes?.field);
        return new Response('OK', { status: 200 });
      }

      const value = changes.value;
      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id;
      const displayPhoneNumber = metadata?.display_phone_number;

      console.log('Webhook metadata:', { phoneNumberId, displayPhoneNumber });

      // Supabase client already created at top level

      // Find channel by phone number ID (stored in app_name) or phone number
      let channel = null;
      
      if (phoneNumberId) {
        const { data } = await supabase
          .from('channels')
          .select('*')
          .eq('app_name', phoneNumberId)
          .eq('provider', 'meta')
          .single();
        channel = data;
      }
      
      if (!channel && displayPhoneNumber) {
        const cleanPhone = displayPhoneNumber.replace(/\D/g, '');
        const { data } = await supabase
          .from('channels')
          .select('*')
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
          .eq('provider', 'meta')
          .single();
        channel = data;
      }

      if (!channel) {
        console.error('Channel not found for phoneNumberId:', phoneNumberId, 'or phone:', displayPhoneNumber);
        return new Response('OK', { status: 200 });
      }

      console.log('Found channel:', channel.id, channel.name);

      // Process incoming messages
      const messages = value.messages || [];
      for (const msg of messages) {
        const messageId = msg.id;
        const senderPhone = msg.from;
        const timestamp = msg.timestamp;
        const messageType = msg.type;

        console.log('Processing message:', { messageId, senderPhone, messageType });

        // Check for duplicate
        const { data: existingMessage } = await supabase
          .from('whatsapp_messages')
          .select('id')
          .eq('message_id', messageId)
          .single();

        if (existingMessage) {
          console.log('Message already exists, skipping:', messageId);
          continue;
        }

        // Extract content based on message type
        let content = '';
        let mediaUrl = '';

        switch (messageType) {
          case 'text':
            content = msg.text?.body || '';
            break;
          case 'image':
            content = msg.image?.caption || '[Imagem]';
            mediaUrl = msg.image?.id || ''; // Media ID, need to fetch URL
            break;
          case 'video':
            content = msg.video?.caption || '[Vídeo]';
            mediaUrl = msg.video?.id || '';
            break;
          case 'audio':
            content = '[Áudio]';
            mediaUrl = msg.audio?.id || '';
            break;
          case 'document':
            content = msg.document?.filename || '[Documento]';
            mediaUrl = msg.document?.id || '';
            break;
          case 'sticker':
            content = '[Sticker]';
            mediaUrl = msg.sticker?.id || '';
            break;
          case 'location':
            const lat = msg.location?.latitude;
            const lng = msg.location?.longitude;
            content = `[Localização: ${lat}, ${lng}]`;
            break;
          case 'contacts':
            const contactName = msg.contacts?.[0]?.name?.formatted_name || 'Contato';
            content = `[Contato: ${contactName}]`;
            break;
          case 'button':
            content = msg.button?.text || '[Botão]';
            break;
          case 'interactive':
            if (msg.interactive?.type === 'button_reply') {
              content = msg.interactive.button_reply?.title || '[Resposta de botão]';
            } else if (msg.interactive?.type === 'list_reply') {
              content = msg.interactive.list_reply?.title || '[Resposta de lista]';
            } else {
              content = '[Interativo]';
            }
            break;
          default:
            content = `[${messageType}]`;
        }

        // Get sender name from contacts
        const contact = value.contacts?.find((c: { wa_id: string }) => c.wa_id === senderPhone);
        const senderName = contact?.profile?.name || null;

        // Store message
        const { error: insertError } = await supabase
          .from('whatsapp_messages')
          .insert({
            channel_id: channel.id,
            organization_id: channel.organization_id,
            message_id: messageId,
            sender_phone: senderPhone,
            sender_name: senderName,
            message_type: messageType,
            content: content,
            media_url: mediaUrl || null,
            direction: 'inbound',
            status: 'received',
            is_read: false,
            metadata: {
              timestamp,
              raw: msg,
              provider: 'meta'
            }
          });

        if (insertError) {
          console.error('Error storing message:', insertError);
        } else {
          console.log('Message stored successfully:', messageId);
        }

        // Check if sender is a lead, if not create one
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', senderPhone)
          .single();

        if (!existingLead && channel.organization_id) {
          const { error: leadError } = await supabase
            .from('leads')
            .insert({
              phone: senderPhone,
              name: senderName || `WhatsApp ${senderPhone}`,
              user_id: channel.user_id,
              organization_id: channel.organization_id,
              status: 'new',
              notes: 'Lead criado automaticamente via WhatsApp (Meta)'
            });

          if (leadError) {
            console.error('Error creating lead:', leadError);
          } else {
            console.log('Lead created for:', senderPhone);
          }
        }
      }

      // Process status updates
      const statuses = value.statuses || [];
      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status; // sent, delivered, read, failed

        console.log('Processing status update:', { messageId, status: statusValue });

        const { error: updateError } = await supabase
          .from('whatsapp_messages')
          .update({ 
            status: statusValue,
            updated_at: new Date().toISOString()
          })
          .eq('message_id', messageId);

        if (updateError) {
          console.error('Error updating message status:', updateError);
        } else {
          console.log('Message status updated:', messageId, statusValue);
        }
      }

      return new Response('OK', { status: 200 });

    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response('OK', { status: 200 }); // Always return 200 to Meta
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
