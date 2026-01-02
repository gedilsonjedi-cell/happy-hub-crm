import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Helper function to check if currently within business hours
async function isWithinBusinessHours(organizationId: string): Promise<{ isOpen: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay();
  const currentTime = brazilTime.toTimeString().slice(0, 5);

  const { data: businessHour } = await supabase
    .from('business_hours')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('day_of_week', dayOfWeek)
    .single();

  if (!businessHour) {
    return { isOpen: true, awayMessage: null };
  }

  if (!businessHour.is_active) {
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isOpen: false, awayMessage: awayConfig.message };
    }
    return { isOpen: false, awayMessage: null };
  }

  const startTime = businessHour.start_time.slice(0, 5);
  const endTime = businessHour.end_time.slice(0, 5);
  
  const isOpen = currentTime >= startTime && currentTime <= endTime;

  if (!isOpen) {
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isOpen: false, awayMessage: awayConfig.message };
    }
  }

  return { isOpen, awayMessage: null };
}

// Helper function to check if today is a holiday
async function isHoliday(organizationId: string): Promise<{ isHoliday: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = brazilTime.toISOString().slice(0, 10);
  const monthDay = today.slice(5);

  const { data: exactHoliday } = await supabase
    .from('holidays')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('date', today)
    .single();

  if (exactHoliday) {
    console.log('Today is a holiday:', exactHoliday.name);
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isHoliday: true, awayMessage: awayConfig.message };
    }
    return { isHoliday: true, awayMessage: null };
  }

  const { data: holidays } = await supabase
    .from('holidays')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_recurring', true);

  const recurringMatch = holidays?.find(h => h.date.slice(5) === monthDay);
  
  if (recurringMatch) {
    console.log('Today is a recurring holiday:', recurringMatch.name);
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isHoliday: true, awayMessage: awayConfig.message };
    }
    return { isHoliday: true, awayMessage: null };
  }

  return { isHoliday: false, awayMessage: null };
}

// Helper function to send WhatsApp message via Z-API
async function sendZApiMessage(instanceId: string, token: string, recipientPhone: string, message: string): Promise<boolean> {
  try {
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: message
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error sending Z-API message:', errorBody);
      return false;
    }

    console.log('Z-API message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending Z-API message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook events (POST request from Z-API)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Z-API webhook received:', JSON.stringify(body, null, 2));

      // Z-API sends different event types
      // Common structure: { phone, event, messageId, ... }
      const phone = body.phone;
      const instanceId = body.instanceId;
      const messageId = body.messageId || body.id?.id || `zapi_${Date.now()}`;
      
      // Check if it's an incoming message
      const isMessage = body.isFromMe === false || body.fromMe === false;
      const isStatusUpdate = body.status !== undefined || body.event === 'message-status-update';

      if (isStatusUpdate) {
        console.log('Status update received, skipping:', body.status);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (!isMessage) {
        console.log('Not an incoming message, skipping');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (!phone) {
        console.log('No phone number in webhook payload');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Find channel by instanceId (stored in app_name)
      let channel = null;
      
      if (instanceId) {
        const { data } = await supabase
          .from('channels')
          .select('*')
          .eq('app_name', instanceId)
          .eq('provider', 'zapi')
          .single();
        channel = data;
      }
      
      // Fallback: try to find by phone if instanceId not matched
      if (!channel) {
        const cleanPhone = phone.replace(/\D/g, '');
        const { data: channels } = await supabase
          .from('channels')
          .select('*')
          .eq('provider', 'zapi')
          .eq('connected', true);
        
        // Try to match any Z-API channel (for single instance setups)
        if (channels && channels.length > 0) {
          channel = channels[0];
          console.log('Using first available Z-API channel:', channel.id);
        }
      }

      if (!channel) {
        console.error('Z-API channel not found for instanceId:', instanceId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      console.log('Found Z-API channel:', channel.id, channel.name);

      // Extract message content
      let content = '';
      let messageType = 'text';
      let mediaUrl = '';
      let senderName = body.senderName || body.pushName || null;
      const senderPhone = phone.replace(/\D/g, '');

      // Z-API message types
      if (body.text?.message) {
        content = body.text.message;
        messageType = 'text';
      } else if (body.image) {
        content = body.image.caption || '[Imagem]';
        mediaUrl = body.image.imageUrl || body.image.url || '';
        messageType = 'image';
      } else if (body.video) {
        content = body.video.caption || '[Vídeo]';
        mediaUrl = body.video.videoUrl || body.video.url || '';
        messageType = 'video';
      } else if (body.audio) {
        content = '[Áudio]';
        mediaUrl = body.audio.audioUrl || body.audio.url || '';
        messageType = 'audio';
      } else if (body.document) {
        content = body.document.fileName || '[Documento]';
        mediaUrl = body.document.documentUrl || body.document.url || '';
        messageType = 'document';
      } else if (body.sticker) {
        content = '[Sticker]';
        mediaUrl = body.sticker.stickerUrl || body.sticker.url || '';
        messageType = 'sticker';
      } else if (body.location) {
        content = `[Localização: ${body.location.latitude}, ${body.location.longitude}]`;
        messageType = 'location';
      } else if (body.contact) {
        content = `[Contato: ${body.contact.displayName || 'Contato'}]`;
        messageType = 'contacts';
      } else if (body.message) {
        content = body.message;
        messageType = 'text';
      } else {
        content = '[Mensagem não suportada]';
      }

      // Check for duplicate
      const { data: existingMessage } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (existingMessage) {
        console.log('Message already exists, skipping:', messageId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

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
            timestamp: body.momment || body.timestamp || Date.now(),
            raw: body,
            provider: 'zapi'
          }
        });

      if (insertError) {
        console.error('Error storing Z-API message:', insertError);
      } else {
        console.log('Z-API message stored successfully:', messageId);

        // Check business hours and holidays for away message
        if (channel.organization_id && channel.access_token && channel.app_name) {
          const instanceId = channel.app_name;
          const token = channel.access_token;

          const holidayCheck = await isHoliday(channel.organization_id);
          
          if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
            console.log('Sending holiday away message via Z-API');
            await sendZApiMessage(instanceId, token, senderPhone, holidayCheck.awayMessage);
          } else if (!holidayCheck.isHoliday) {
            const businessCheck = await isWithinBusinessHours(channel.organization_id);
            
            if (!businessCheck.isOpen && businessCheck.awayMessage) {
              console.log('Sending outside business hours away message via Z-API');
              await sendZApiMessage(instanceId, token, senderPhone, businessCheck.awayMessage);
            }
          }
        }
      }

      // Check if sender is a lead, if not create one
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, name')
        .eq('phone', senderPhone)
        .eq('organization_id', channel.organization_id)
        .single();

      let leadId = existingLead?.id;

      if (!existingLead && channel.organization_id) {
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            phone: senderPhone,
            name: senderName || `WhatsApp ${senderPhone}`,
            user_id: channel.user_id,
            organization_id: channel.organization_id,
            status: 'new',
            notes: 'Lead criado automaticamente via WhatsApp (Z-API)'
          })
          .select('id')
          .single();

        if (leadError) {
          console.error('Error creating lead:', leadError);
        } else {
          console.log('Lead created for:', senderPhone);
          leadId = newLead?.id;
        }
      } else if (existingLead && senderName && channel.organization_id) {
        // Update lead name if it was auto-generated
        const isAutoGeneratedName = existingLead.name.startsWith('LeadWhats-') || 
                                     existingLead.name.startsWith('WhatsApp ');
        
        if (isAutoGeneratedName) {
          await supabase
            .from('leads')
            .update({ 
              name: senderName,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingLead.id);
          console.log('Lead name updated from', existingLead.name, 'to', senderName);
        }
      }

      // Handle conversation assignment and chatbot (similar to meta-webhook)
      if (leadId && channel.organization_id) {
        const { data: portfolioEntry } = await supabase
          .from('client_portfolios')
          .select('user_id')
          .eq('lead_id', leadId)
          .eq('organization_id', channel.organization_id)
          .single();

        if (portfolioEntry) {
          console.log('Lead is in portfolio of user:', portfolioEntry.user_id);

          const { data: existingAssignment } = await supabase
            .from('conversation_assignments')
            .select('id')
            .eq('conversation_phone', senderPhone)
            .eq('channel_id', channel.id)
            .single();

          if (!existingAssignment) {
            const { data: ownerAvailability } = await supabase
              .from('attendant_availability')
              .select('is_available')
              .eq('user_id', portfolioEntry.user_id)
              .eq('organization_id', channel.organization_id)
              .single();

            const isOwnerAvailable = ownerAvailability?.is_available === true;
            
            await supabase
              .from('conversation_assignments')
              .insert({
                conversation_phone: senderPhone,
                channel_id: channel.id,
                lead_id: leadId,
                assigned_to: isOwnerAvailable ? portfolioEntry.user_id : null,
                status: isOwnerAvailable ? 'active' : 'pending',
                is_bot_handling: !isOwnerAvailable,
              });
          }
        }
      }

      // Check chatbot config and invoke chatbot if enabled
      const { data: chatbotConfig } = await supabase
        .from('chatbot_config')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('is_enabled', true)
        .single();

      if (chatbotConfig) {
        console.log('Chatbot enabled for this channel, invoking chatbot...');
        
        try {
          // Call the chatbot edge function
          const chatbotResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/zapi-chatbot`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                channelId: channel.id,
                senderPhone: senderPhone,
                senderName: senderName,
                messageContent: content,
                messageId: messageId,
                organizationId: channel.organization_id,
                instanceId: channel.app_name,
                token: channel.access_token,
              }),
            }
          );

          const chatbotResult = await chatbotResponse.json();
          console.log('Chatbot response:', chatbotResult);
        } catch (chatbotError) {
          console.error('Error calling chatbot:', chatbotError);
        }
      } else {
        console.log('No chatbot config for this channel or chatbot disabled');
      }

      return new Response('OK', { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error('Error processing Z-API webhook:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  // GET request - health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'Z-API webhook is active' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
