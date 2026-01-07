import { createClient } from "npm:@supabase/supabase-js@2";

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
  // Get current date/time in Brazil timezone (most common for this app)
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay(); // 0 = Sunday, 6 = Saturday
  const currentTime = brazilTime.toTimeString().slice(0, 5); // HH:MM format

  // Check business hours for today
  const { data: businessHour } = await supabase
    .from('business_hours')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('day_of_week', dayOfWeek)
    .single();

  // If no business hours configured, consider as always open (optional feature)
  if (!businessHour) {
    console.log('No business hours configured for day', dayOfWeek, '- skipping check');
    return { isOpen: true, awayMessage: null };
  }

  // If day is not active, check for away message
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

  // Check if current time is within business hours
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
  const today = brazilTime.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthDay = today.slice(5); // MM-DD for recurring check

  // Check for exact date match
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

  // Check for recurring holidays (same month-day every year)
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

// Helper function to send WhatsApp message via Meta API
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, recipientPhone: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error sending away message:', errorBody);
      return false;
    }

    console.log('Away message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending away message:', error);
    return false;
  }
}

// Helper function to download media from Meta and upload to Supabase Storage
async function downloadAndStoreMedia(
  mediaId: string, 
  accessToken: string, 
  organizationId: string,
  mimeType?: string
): Promise<string | null> {
  try {
    console.log('Downloading media from Meta, ID:', mediaId);
    
    // Step 1: Get media URL from Meta
    const mediaInfoResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('Error getting media info:', errorText);
      return null;
    }
    
    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;
    const mediaMimeType = mimeType || mediaInfo.mime_type || 'application/octet-stream';
    
    console.log('Media info:', { url: mediaUrl, mimeType: mediaMimeType });
    
    // Step 2: Download media binary
    const mediaDownloadResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!mediaDownloadResponse.ok) {
      console.error('Error downloading media:', await mediaDownloadResponse.text());
      return null;
    }
    
    const mediaBlob = await mediaDownloadResponse.blob();
    const arrayBuffer = await mediaBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Step 3: Determine file extension
    let extension = 'bin';
    if (mediaMimeType.includes('audio/ogg')) {
      extension = 'ogg';
    } else if (mediaMimeType.includes('audio/mpeg') || mediaMimeType.includes('audio/mp3')) {
      extension = 'mp3';
    } else if (mediaMimeType.includes('audio/mp4') || mediaMimeType.includes('audio/m4a')) {
      extension = 'm4a';
    } else if (mediaMimeType.includes('audio')) {
      extension = 'ogg';
    } else if (mediaMimeType.includes('image/jpeg')) {
      extension = 'jpg';
    } else if (mediaMimeType.includes('image/png')) {
      extension = 'png';
    } else if (mediaMimeType.includes('image/webp')) {
      extension = 'webp';
    } else if (mediaMimeType.includes('video/mp4')) {
      extension = 'mp4';
    } else if (mediaMimeType.includes('video')) {
      extension = 'mp4';
    } else if (mediaMimeType.includes('application/pdf')) {
      extension = 'pdf';
    }
    
    // Step 4: Upload to Supabase Storage
    const fileName = `${organizationId}/inbound_${Date.now()}_${mediaId.slice(-8)}.${extension}`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('whatsapp-media')
      .upload(fileName, uint8Array, {
        contentType: mediaMimeType,
        upsert: false,
      });
    
    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      return null;
    }
    
    // Step 5: Get public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);
    
    console.log('Media stored successfully:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
    
  } catch (error) {
    console.error('Error in downloadAndStoreMedia:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      // Find any channel with this verify token (may be shared across multiple channels in same WABA)
      const { data: channels, error } = await supabase
        .from('channels')
        .select('id, waba_id')
        .eq('webhook_verify_token', token)
        .eq('provider', 'meta')
        .limit(1);
      
      if (channels && channels.length > 0 && !error) {
        console.log('Webhook verified for channel:', channels[0].id, 'WABA:', channels[0].waba_id);
        return new Response(challenge, { status: 200 });
      } else {
        console.error('Invalid verify token, no channel found');
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
          .in('phone', [cleanPhone, `+${cleanPhone}`])
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
        let mediaId = '';
        let mediaMimeType = '';

        switch (messageType) {
          case 'text':
            content = msg.text?.body || '';
            break;
          case 'image':
            content = msg.image?.caption || '[Imagem]';
            mediaId = msg.image?.id || '';
            mediaMimeType = msg.image?.mime_type || '';
            break;
          case 'video':
            content = msg.video?.caption || '[Vídeo]';
            mediaId = msg.video?.id || '';
            mediaMimeType = msg.video?.mime_type || '';
            break;
          case 'audio':
            content = '[Áudio]';
            mediaId = msg.audio?.id || '';
            mediaMimeType = msg.audio?.mime_type || '';
            break;
          case 'document':
            content = msg.document?.filename || '[Documento]';
            mediaId = msg.document?.id || '';
            mediaMimeType = msg.document?.mime_type || '';
            break;
          case 'sticker':
            content = '[Sticker]';
            mediaId = msg.sticker?.id || '';
            mediaMimeType = msg.sticker?.mime_type || 'image/webp';
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

        // If there's media, download and store it
        if (mediaId && channel.access_token && channel.organization_id) {
          console.log('Processing media:', { mediaId, mediaMimeType, messageType });
          const storedMediaUrl = await downloadAndStoreMedia(
            mediaId, 
            channel.access_token, 
            channel.organization_id,
            mediaMimeType
          );
          
          if (storedMediaUrl) {
            mediaUrl = storedMediaUrl;
          } else {
            // Fallback: store media ID so we can try again later or show error
            mediaUrl = mediaId;
            console.warn('Failed to download media, storing ID only:', mediaId);
          }
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

          // Check business hours and holidays for away message (only if organization configured)
          if (channel.organization_id && channel.access_token && channel.app_name) {
            // First check if it's a holiday
            const holidayCheck = await isHoliday(channel.organization_id);
            
            if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
              console.log('Sending holiday away message');
              await sendWhatsAppMessage(
                channel.app_name, // phone_number_id
                channel.access_token,
                senderPhone,
                holidayCheck.awayMessage
              );
            } else if (!holidayCheck.isHoliday) {
              // Not a holiday, check business hours
              const businessCheck = await isWithinBusinessHours(channel.organization_id);
              
              if (!businessCheck.isOpen && businessCheck.awayMessage) {
                console.log('Sending outside business hours away message');
                await sendWhatsAppMessage(
                  channel.app_name,
                  channel.access_token,
                  senderPhone,
                  businessCheck.awayMessage
                );
              }
            }
          }
        }

        // Check if sender is a lead, if not create one
        // Also update lead name if it was auto-generated and we now have the real WhatsApp name
        // Normalize phone for search - remove all non-digits
        const normalizedSenderPhone = senderPhone.replace(/\D/g, '');
        // Remove country code to get local number
        const localNumber = normalizedSenderPhone.startsWith('55') 
          ? normalizedSenderPhone.slice(2) 
          : normalizedSenderPhone;
        // Get last 8 digits (most stable - doesn't change with 9th digit)
        const phoneEnd8 = localNumber.slice(-8);
        
        // Search for lead using multiple phone format patterns including 8-digit suffix
        const phoneSearchPatterns = [
          normalizedSenderPhone,
          `+${normalizedSenderPhone}`,
          `55${localNumber}`,
          `+55${localNumber}`,
        ];
        
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, name, custom_fields, document')
          .eq('organization_id', channel.organization_id)
          .in('phone', phoneSearchPatterns)
          .limit(1)
          .maybeSingle();

        let leadId = existingLead?.id;

        if (!existingLead && channel.organization_id) {
          // Create new lead
          const { data: newLead, error: leadError } = await supabase
            .from('leads')
            .insert({
              phone: senderPhone,
              name: senderName || `WhatsApp ${senderPhone}`,
              user_id: channel.user_id,
              organization_id: channel.organization_id,
              status: 'new',
              notes: 'Lead criado automaticamente via WhatsApp (Meta)'
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
          // Check if lead has auto-generated name (LeadWhats- pattern or WhatsApp pattern)
          const isAutoGeneratedName = existingLead.name.startsWith('LeadWhats-') || 
                                       existingLead.name.startsWith('WhatsApp ');
          
          if (isAutoGeneratedName) {
            // Update lead with real WhatsApp name
            const { error: updateLeadError } = await supabase
              .from('leads')
              .update({ 
                name: senderName,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingLead.id);

            if (updateLeadError) {
              console.error('Error updating lead name:', updateLeadError);
            } else {
              console.log('Lead name updated from', existingLead.name, 'to', senderName);
            }
          }
        }

        // Check if lead is in someone's portfolio (Carteira de Clientes)
        if (leadId && channel.organization_id) {
          const { data: portfolioEntry } = await supabase
            .from('client_portfolios')
            .select('user_id')
            .eq('lead_id', leadId)
            .eq('organization_id', channel.organization_id)
            .single();

          if (portfolioEntry) {
            console.log('Lead is in portfolio of user:', portfolioEntry.user_id);

            // Check if portfolio owner is available
            const { data: ownerAvailability } = await supabase
              .from('attendant_availability')
              .select('is_available')
              .eq('user_id', portfolioEntry.user_id)
              .eq('organization_id', channel.organization_id)
              .single();

            // Check or create conversation assignment
            const { data: existingAssignment } = await supabase
              .from('conversation_assignments')
              .select('id, assigned_to, status')
              .eq('conversation_phone', senderPhone)
              .eq('channel_id', channel.id)
              .single();

            if (!existingAssignment) {
              // Create new assignment
              const isOwnerAvailable = ownerAvailability?.is_available === true;
              
              const { error: assignError } = await supabase
                .from('conversation_assignments')
                .insert({
                  conversation_phone: senderPhone,
                  channel_id: channel.id,
                  lead_id: leadId,
                  assigned_to: isOwnerAvailable ? portfolioEntry.user_id : null,
                  status: isOwnerAvailable ? 'active' : 'pending',
                  is_bot_handling: !isOwnerAvailable,
                });

              if (assignError) {
                console.error('Error creating assignment:', assignError);
              } else {
                console.log('Assignment created:', isOwnerAvailable ? 'to owner' : 'pending');
              }
            } else if (existingAssignment.status === 'pending' || !existingAssignment.assigned_to) {
              // If previously pending, check if owner is now available
              const isOwnerAvailable = ownerAvailability?.is_available === true;
              
              if (isOwnerAvailable) {
                const { error: updateAssignError } = await supabase
                  .from('conversation_assignments')
                  .update({
                    assigned_to: portfolioEntry.user_id,
                    status: 'active',
                    is_bot_handling: false,
                    assigned_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingAssignment.id);

                if (updateAssignError) {
                  console.error('Error updating assignment:', updateAssignError);
                } else {
                  console.log('Assignment updated to owner');
                }
              }
            }
          }
        }
      }

      // Process status updates
      const statuses = value.statuses || [];
      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status; // sent, delivered, read, failed

        console.log('Processing status update:', { messageId, status: statusValue });

        // Get the message to check if it was part of a campaign
        const { data: messageData } = await supabase
          .from('whatsapp_messages')
          .select('id, status, metadata')
          .eq('message_id', messageId)
          .single();

        const previousStatus = messageData?.status;

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

          // If message failed and was previously sent/delivered, update campaign counters
          if (statusValue === 'failed' && previousStatus !== 'failed' && messageData?.metadata) {
            const metadata = messageData.metadata as Record<string, unknown>;
            const campaignId = metadata?.campaignId as string | undefined;
            
            if (campaignId) {
              console.log('Updating campaign counters for failed message, campaignId:', campaignId);
              
              // Get current campaign counts
              const { data: campaign } = await supabase
                .from('campaigns')
                .select('delivered_count, failed_count')
                .eq('id', campaignId)
                .single();
              
              if (campaign) {
                // Decrement delivered, increment failed
                const newDeliveredCount = Math.max(0, (campaign.delivered_count || 0) - 1);
                const newFailedCount = (campaign.failed_count || 0) + 1;
                
                await supabase
                  .from('campaigns')
                  .update({ 
                    delivered_count: newDeliveredCount,
                    failed_count: newFailedCount
                  })
                  .eq('id', campaignId);
                
                console.log('Campaign counters updated:', { delivered: newDeliveredCount, failed: newFailedCount });
              }
            }
          }
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
