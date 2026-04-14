import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// External DB is the SINGLE SOURCE OF TRUTH for whatsapp_messages
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

/** DB where whatsapp_messages live — external only, NO internal fallback */
const messageDb = externalSupabase || supabase;

/** Write to whatsapp_messages on external DB (no fallback) + update conversation_stats */
function dualWriteMessage(data: Record<string, unknown>, internalChannelId?: string) {
  return messageDb.from('whatsapp_messages').insert(data).then(async (result) => {
    if (result.error) {
      console.error('[Gupshup Webhook] Message write failed:', result.error);
    }
    if (!result.error && data.channel_id && data.direction) {
      const phone = data.direction === 'inbound'
        ? (data.sender_phone as string)
        : ((data.metadata as Record<string, unknown>)?.destination as string);
      if (phone) {
        const statsChannelId = internalChannelId || data.channel_id;
        supabase.rpc('upsert_conversation_stats_manual', {
          _channel_id: statsChannelId,
          _conversation_phone: phone,
          _content: (data.content as string) || null,
          _direction: data.direction as string,
          _is_read: (data.is_read as boolean) ?? null,
          _sender_name: (data.sender_name as string) || null,
          _created_at: new Date().toISOString(),
        }).then(() => {}).catch((e: unknown) => console.error('[Stats] Error:', e));
      }
    }
    return result;
  });
}

/** Update whatsapp_messages on external DB only */
function dualUpdateMessage(filter: { column: string; op: string; value: string }, updateData: Record<string, unknown>) {
  return messageDb.from('whatsapp_messages').update(updateData).eq(filter.column, filter.value);
}

// ===========================================
// PHONE NORMALIZATION
// ===========================================
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

// ===========================================
// BUSINESS HOURS CHECK
// ===========================================
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

// ===========================================
// HOLIDAY CHECK
// ===========================================
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

// ===========================================
// ATTENDANT AUTO-DISTRIBUTION
// ===========================================
async function getNextAvailableAttendant(
  organizationId: string,
  sectorId: string | null
): Promise<{ userId: string; userName: string } | null> {
  if (!sectorId) return null;

  const { data: sectorUsers } = await supabase
    .from('user_sectors')
    .select('user_id')
    .eq('sector_id', sectorId);

  if (!sectorUsers || sectorUsers.length === 0) return null;

  const userIds = sectorUsers.map(u => u.user_id);

  const { data: availableAttendants } = await supabase
    .from('attendant_availability')
    .select('user_id, last_assignment_at')
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .in('user_id', userIds)
    .order('last_assignment_at', { ascending: true, nullsFirst: true });

  if (!availableAttendants || availableAttendants.length === 0) return null;

  const nextAttendant = availableAttendants[0];
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('user_id', nextAttendant.user_id)
    .single();

  const userName = profile?.display_name || profile?.email || 'Atendente';

  await supabase
    .from('attendant_availability')
    .update({ last_assignment_at: new Date().toISOString() })
    .eq('user_id', nextAttendant.user_id)
    .eq('organization_id', organizationId);

  return { userId: nextAttendant.user_id, userName };
}

// ===========================================
// FIND OR CREATE LEAD
// ===========================================
async function findOrCreateLead(
  organizationId: string,
  channelUserId: string,
  rawPhone: string,
  senderName: string | null
): Promise<{ leadId: string; isNew: boolean }> {
  const normalizedPhone = normalizePhone(rawPhone);
  const localNumber = normalizedPhone.slice(2);
  const phoneEnd8 = localNumber.slice(-8);

  const phoneSearchPatterns = [
    normalizedPhone,
    `+${normalizedPhone}`,
    `55${localNumber}`,
    `+55${localNumber}`,
    localNumber,
    rawPhone,
  ];

  const { data: exactMatches } = await supabase
    .from('leads')
    .select('id, name, phone, tags, document')
    .eq('organization_id', organizationId)
    .in('phone', phoneSearchPatterns)
    .limit(10);

  let suffixMatches: typeof exactMatches = [];
  if (phoneEnd8.length === 8) {
    const { data: suffixData } = await supabase
      .from('leads')
      .select('id, name, phone, tags, document')
      .eq('organization_id', organizationId)
      .like('phone', `%${phoneEnd8}`)
      .limit(10);
    suffixMatches = suffixData || [];
  }

  const allMatches = [...(exactMatches || []), ...suffixMatches];
  const uniqueMatches = allMatches.filter((lead, index, self) =>
    index === self.findIndex(l => l.id === lead.id)
  );

  if (uniqueMatches.length > 0) {
    const scored = uniqueMatches.map(lead => {
      let score = 0;
      const isAutoGenerated = lead.name?.startsWith('LeadWhats-') || lead.name?.startsWith('WhatsApp ');
      if (lead.tags && lead.tags.length > 0) score += 100;
      if (lead.name && !isAutoGenerated) score += 50;
      if (lead.document) score += 5;
      if (lead.phone === normalizedPhone) score += 10;
      return { lead, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestLead = scored[0].lead;

    const isAutoGeneratedName = bestLead.name?.startsWith('LeadWhats-') || bestLead.name?.startsWith('WhatsApp ');
    if (isAutoGeneratedName && senderName) {
      await supabase.from('leads').update({ name: senderName, updated_at: new Date().toISOString() }).eq('id', bestLead.id);
    }

    if (bestLead.phone !== normalizedPhone) {
      await supabase.from('leads').update({ phone: normalizedPhone, updated_at: new Date().toISOString() }).eq('id', bestLead.id);
    }

    return { leadId: bestLead.id, isNew: false };
  }

  const { data: newLead, error: leadError } = await supabase
    .from('leads')
    .insert({
      phone: normalizedPhone,
      name: senderName || `WhatsApp ${normalizedPhone}`,
      user_id: channelUserId,
      organization_id: organizationId,
      status: 'new',
      notes: 'Lead criado automaticamente via WhatsApp (Gupshup)'
    })
    .select('id')
    .single();

  if (leadError) {
    console.error('Error creating lead:', leadError);
    throw new Error('Failed to create lead');
  }

  return { leadId: newLead.id, isNew: true };
}

// ===========================================
// FIND SECTOR FROM CAMPAIGN
// ===========================================
async function findSectorFromCampaign(organizationId: string, leadId: string): Promise<string | null> {
  const { data: recipientByLead } = await supabase
    .from('campaign_recipients')
    .select('campaign_id, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  for (const recipient of recipientByLead || []) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('sector_id, name')
      .eq('id', recipient.campaign_id)
      .eq('organization_id', organizationId)
      .not('sector_id', 'is', null)
      .single();

    if (campaign?.sector_id) return campaign.sector_id;
  }

  return null;
}

// ===========================================
// HANDLE CONVERSATION ASSIGNMENT
// ===========================================
async function handleConversationAssignment(
  organizationId: string,
  channelId: string,
  leadId: string,
  normalizedPhone: string
): Promise<void> {
  // Look up existing assignment by lead_id + channel_id
  let { data: existingAssignment } = await supabase
    .from('conversation_assignments')
    .select('id, assigned_to, status, sector_id, conversation_phone, lead_id, updated_at')
    .eq('lead_id', leadId)
    .eq('channel_id', channelId)
    .single();

  // Fallback: search by phone suffix
  if (!existingAssignment) {
    const phoneEnd8 = normalizedPhone.slice(-8);
    const { data: phoneMatch } = await supabase
      .from('conversation_assignments')
      .select('id, assigned_to, status, sector_id, conversation_phone, lead_id, updated_at')
      .eq('channel_id', channelId)
      .like('conversation_phone', `%${phoneEnd8}`)
      .single();

    if (phoneMatch) {
      existingAssignment = phoneMatch;
      if (!phoneMatch.lead_id) {
        await supabase
          .from('conversation_assignments')
          .update({ lead_id: leadId, conversation_phone: normalizedPhone, updated_at: new Date().toISOString() })
          .eq('id', phoneMatch.id);
      }
    }
  }

  if (existingAssignment) {
    const wasArchived = existingAssignment.status === 'archived';

    // Grace period: don't reactivate conversations archived less than 2 minutes ago
    // Only applies to MANUALLY archived conversations (has assigned_to), not campaign-created ones
    const wasRecentlyArchived = wasArchived && existingAssignment.assigned_to && existingAssignment.updated_at &&
      (Date.now() - new Date(existingAssignment.updated_at).getTime()) < 2 * 60 * 1000;

    if (wasRecentlyArchived) {
      console.log(`[Gupshup Webhook] Skipping reactivation for recently archived conversation: ${normalizedPhone}`);
      return;
    }

    if (existingAssignment.conversation_phone !== normalizedPhone) {
      await supabase
        .from('conversation_assignments')
        .update({ conversation_phone: normalizedPhone, updated_at: new Date().toISOString() })
        .eq('id', existingAssignment.id);
    }

    if (wasArchived) {
      console.log(`[handleConversationAssignment] Reactivated archived conversation for ${normalizedPhone}`);

      if (existingAssignment.assigned_to) {
        await supabase
          .from('conversation_assignments')
          .update({ status: 'in_progress', is_bot_handling: false, updated_at: new Date().toISOString() })
          .eq('id', existingAssignment.id);
      } else {
        const sectorId = existingAssignment.sector_id || await findSectorFromCampaign(organizationId, leadId);
        await supabase
          .from('conversation_assignments')
          .update({
            status: sectorId ? 'active' : 'in_progress',
            sector_id: sectorId,
            is_bot_handling: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAssignment.id);
      }
    } else if (existingAssignment.status !== 'in_progress' && existingAssignment.status !== 'active') {
      await supabase
        .from('conversation_assignments')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', existingAssignment.id);
    }
    return;
  }

  // Create new assignment
  const sectorId = await findSectorFromCampaign(organizationId, leadId);
  let assignedTo: string | null = null;
  let status = 'in_progress';

  // Check portfolio
  const { data: portfolioEntry } = await supabase
    .from('client_portfolios')
    .select('user_id')
    .eq('lead_id', leadId)
    .eq('organization_id', organizationId)
    .single();

  if (portfolioEntry) {
    const { data: ownerAvailability } = await supabase
      .from('attendant_availability')
      .select('is_available')
      .eq('user_id', portfolioEntry.user_id)
      .eq('organization_id', organizationId)
      .single();

    if (ownerAvailability?.is_available === true) {
      assignedTo = portfolioEntry.user_id;
      status = 'active';
    }
  } else if (sectorId) {
    const nextAttendant = await getNextAvailableAttendant(organizationId, sectorId);
    if (nextAttendant) {
      assignedTo = nextAttendant.userId;
      status = 'active';
    }
  }

  await supabase
    .from('conversation_assignments')
    .insert({
      conversation_phone: normalizedPhone,
      channel_id: channelId,
      lead_id: leadId,
      assigned_to: assignedTo,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      status,
      is_bot_handling: !assignedTo,
      sector_id: sectorId,
    });

  console.log('Assignment created for Gupshup conversation:', normalizedPhone);
}

// ===========================================
// SEND GUPSHUP MESSAGE (for away messages, etc.)
// ===========================================
async function sendGupshupMessage(
  apiKey: string,
  appName: string,
  sourcePhone: string,
  recipientPhone: string,
  message: string
): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append('channel', 'whatsapp');
    formData.append('source', sourcePhone);
    formData.append('src.name', appName);
    formData.append('destination', recipientPhone.replace(/\D/g, ''));
    formData.append('message', JSON.stringify({ type: 'text', text: message }));

    const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': apiKey,
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error sending Gupshup message:', errorBody);
      return false;
    }

    const responseText = await response.text();
    console.log('Gupshup away message sent:', responseText);
    return true;
  } catch (error) {
    console.error('Error sending Gupshup message:', error);
    return false;
  }
}

// ===========================================
// MAIN WEBHOOK HANDLER
// ===========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'Gupshup webhook is active' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Gupshup webhook received:', JSON.stringify(body, null, 2));

      // Gupshup sends different event types
      const eventType = body.type;

      // Handle message-event (status updates like sent, delivered, read)
      if (eventType === 'message-event') {
        const payload = body.payload;
        const gsMessageId = payload?.gsId || payload?.id;
        const statusType = payload?.type; // sent, delivered, read, failed, enqueued

        if (gsMessageId && statusType) {
          const statusMap: Record<string, string> = {
            'sent': 'sent',
            'delivered': 'delivered',
            'read': 'read',
            'failed': 'failed',
            'enqueued': 'sent',
          };

          const mappedStatus = statusMap[statusType] || statusType;

          // Update message status
          const { error: updateError } = await dualUpdateMessage(
            { column: 'message_id', op: 'eq', value: gsMessageId },
            { status: mappedStatus }
          );

          if (updateError) {
            console.log('Could not update status for message:', gsMessageId, updateError);
          } else {
            console.log('Updated message status:', gsMessageId, '->', mappedStatus);
          }
        }

        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Handle user-event (opted-in, opted-out, etc.)
      if (eventType === 'user-event' || eventType === 'account-event' || eventType === 'billing-event' || eventType === 'template-event') {
        console.log('Non-message event, skipping:', eventType);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Handle inbound message (type === 'message')
      if (eventType !== 'message') {
        console.log('Unknown event type, skipping:', eventType);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const appName = body.app;
      const payload = body.payload;

      if (!payload) {
        console.log('No payload in webhook');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const senderPhone = payload.source;
      const messageId = payload.id || `gupshup_${Date.now()}`;
      const senderName = payload.sender?.name || null;
      const messagePayloadType = payload.type; // text, image, file, audio, video, contact, location, button_reply, list_reply

      if (!senderPhone) {
        console.log('No sender phone in webhook payload');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Find channel by app_name
      const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('app_name', appName)
        .eq('provider', 'gupshup')
        .single();

      if (!channel) {
        // Fallback: try to find any gupshup channel
        const { data: channels } = await supabase
          .from('channels')
          .select('*')
          .eq('provider', 'gupshup')
          .eq('connected', true);

        if (!channels || channels.length === 0) {
          console.error('No Gupshup channel found for app:', appName);
          return new Response('OK', { status: 200, headers: corsHeaders });
        }

        // Use the first matching channel
        console.log('Using fallback Gupshup channel:', channels[0].id);
        return await processInboundMessage(channels[0], senderPhone, messageId, senderName, messagePayloadType, payload, body);
      }

      return await processInboundMessage(channel, senderPhone, messageId, senderName, messagePayloadType, payload, body);
    } catch (error) {
      console.error('Error processing Gupshup webhook:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});

async function processInboundMessage(
  channel: Record<string, unknown>,
  senderPhone: string,
  messageId: string,
  senderName: string | null,
  messagePayloadType: string,
  payload: Record<string, unknown>,
  rawBody: Record<string, unknown>
): Promise<Response> {
  const normalizedPhone = normalizePhone(senderPhone);
  const channelId = channel.id as string;
  const organizationId = channel.organization_id as string | null;

  // Extract message content
  let content = '';
  let messageType = 'text';
  let mediaUrl = '';

  const innerPayload = payload.payload as Record<string, unknown> | undefined;

  switch (messagePayloadType) {
    case 'text':
      content = (innerPayload?.text as string) || (payload.text as string) || '';
      messageType = 'text';
      break;
    case 'image':
      content = (innerPayload?.caption as string) || '[Imagem]';
      mediaUrl = (innerPayload?.url as string) || '';
      messageType = 'image';
      break;
    case 'video':
      content = (innerPayload?.caption as string) || '[Vídeo]';
      mediaUrl = (innerPayload?.url as string) || '';
      messageType = 'video';
      break;
    case 'audio':
      content = '[Áudio]';
      mediaUrl = (innerPayload?.url as string) || '';
      messageType = 'audio';
      break;
    case 'file':
    case 'document':
      content = (innerPayload?.fileName as string) || (innerPayload?.caption as string) || '[Documento]';
      mediaUrl = (innerPayload?.url as string) || '';
      messageType = 'document';
      break;
    case 'sticker':
      content = '[Sticker]';
      mediaUrl = (innerPayload?.url as string) || '';
      messageType = 'sticker';
      break;
    case 'location':
      const lat = (innerPayload as Record<string, unknown>)?.latitude || '';
      const lng = (innerPayload as Record<string, unknown>)?.longitude || '';
      content = `[Localização: ${lat}, ${lng}]`;
      messageType = 'location';
      break;
    case 'contact':
      content = `[Contato]`;
      messageType = 'contacts';
      break;
    case 'button_reply':
      content = (innerPayload?.title as string) || (innerPayload?.id as string) || '[Resposta de botão]';
      messageType = 'text';
      break;
    case 'list_reply':
      content = (innerPayload?.title as string) || '[Resposta de lista]';
      messageType = 'text';
      break;
    default:
      content = '[Mensagem não suportada]';
  }

  // Check for duplicate
  const { data: existingMessage } = await messageDb
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .single();

  if (existingMessage) {
    console.log('Message already exists, skipping:', messageId);
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  // Store message
  const { error: insertError } = await dualWriteMessage({
      channel_id: normalizedPhone,
      organization_id: organizationId,
      message_id: messageId,
      sender_phone: normalizedPhone,
      sender_name: senderName,
      message_type: messageType,
      content,
      media_url: mediaUrl || null,
      direction: 'inbound',
      status: 'received',
      is_read: false,
      metadata: {
        timestamp: rawBody.timestamp || Date.now(),
        raw: rawBody,
        provider: 'gupshup',
        original_phone: senderPhone,
      },
  }, channelId);

  if (insertError) {
    console.error('Error storing Gupshup message:', insertError);
  } else {
    console.log('Gupshup message stored successfully:', messageId);

    // Check business hours and holidays
    if (organizationId && channel.access_token && channel.app_name) {
      const apiKey = channel.access_token as string;
      const appName = channel.app_name as string;
      const sourcePhone = (channel.phone as string).replace(/\D/g, '');

      const holidayCheck = await isHoliday(organizationId);
      if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
        await sendGupshupMessage(apiKey, appName, sourcePhone, normalizedPhone, holidayCheck.awayMessage);
      } else if (!holidayCheck.isHoliday) {
        const businessCheck = await isWithinBusinessHours(organizationId);
        if (!businessCheck.isOpen && businessCheck.awayMessage) {
          await sendGupshupMessage(apiKey, appName, sourcePhone, normalizedPhone, businessCheck.awayMessage);
        }
      }
    }
  }

  // Handle lead and conversation assignment
  if (organizationId) {
    try {
      const { leadId } = await findOrCreateLead(
        organizationId,
        channel.user_id as string,
        senderPhone,
        senderName
      );

      await handleConversationAssignment(organizationId, channelId, leadId, normalizedPhone);
    } catch (error) {
      console.error('Error handling lead/assignment:', error);
    }
  }

  // Check chatbot config
  const { data: chatbotConfig } = await supabase
    .from('chatbot_config')
    .select('*')
    .eq('channel_id', channelId)
    .eq('is_enabled', true)
    .single();

  if (chatbotConfig) {
    console.log('Chatbot enabled for this Gupshup channel, invoking chatbot...');

    try {
      // Use the generic chatbot function (works with any provider via gupshup-send)
      const chatbotResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            channelId,
            senderPhone: normalizedPhone,
            senderName,
            messageContent: content,
            messageId,
            organizationId,
            provider: 'gupshup',
          }),
        }
      );

      const chatbotResult = await chatbotResponse.text();
      console.log('Chatbot response:', chatbotResult);
    } catch (chatbotError) {
      console.error('Error calling chatbot:', chatbotError);
    }
  }

  return new Response('OK', { status: 200, headers: corsHeaders });
}
