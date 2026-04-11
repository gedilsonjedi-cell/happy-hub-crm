import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// External DB for high-volume tables
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

/** DB where whatsapp_messages live (external preferred, internal fallback) */
const messageDb = externalSupabase || supabase;

/** Write to whatsapp_messages on external DB + update conversation_stats */
async function dualWriteMessage(data: Record<string, unknown>) {
  const result = await messageDb.from('whatsapp_messages').insert(data);
  if (!result.error && data.channel_id && data.direction) {
    const phone = data.direction === 'inbound'
      ? (data.sender_phone as string)
      : ((data.metadata as Record<string, unknown>)?.destination as string);
    if (phone) {
      supabase.rpc('upsert_conversation_stats_manual', {
        _channel_id: data.channel_id,
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
}

/** Update whatsapp_messages on external DB only */
async function dualUpdateMessage(column: string, value: string, updateData: Record<string, unknown>) {
  return messageDb.from('whatsapp_messages').update(updateData).eq(column, value);
}

// Channel cache
const channelCache = new Map<string, { data: unknown; expiry: number }>();

async function getChannelBySender(senderPhone: string) {
  const cacheKey = `infobip_${senderPhone}`;
  const cached = channelCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return cached.data;

  // Try matching by waba_id first, then by phone
  const digits = senderPhone.replace(/\D/g, '');
  
  const { data } = await supabase
    .from('channels')
    .select('id, organization_id, user_id, phone, app_name, access_token, waba_id, provider')
    .eq('provider', 'infobip')
    .or(`waba_id.eq.${digits},phone.ilike.%${digits.slice(-8)}%`);

  const channel = data?.[0] || null;
  channelCache.set(cacheKey, { data: channel, expiry: Date.now() + 60_000 });
  return channel;
}

// Business hours check
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

  if (!businessHour) return { isOpen: true, awayMessage: null };

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Infobip sends webhooks via POST
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('[Infobip-Webhook] Received:', JSON.stringify(body).slice(0, 500));

    const results = body.results || [];
    
    for (const result of results) {
      try {
        await processInfobipEvent(result);
      } catch (err) {
        console.error('[Infobip-Webhook] Error processing event:', err);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Infobip-Webhook] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 200, // Always return 200 to Infobip to avoid retries
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processInfobipEvent(result: Record<string, unknown>) {
  // Check if it's a delivery report (status update)
  if (result.status) {
    await handleDeliveryReport(result);
    return;
  }

  // Check if it's an inbound message
  // Infobip uses "sender"/"destination" OR "from"/"to"
  if (result.message || result.content || result.sender) {
    await handleInboundMessage(result);
    return;
  }

  console.log('[Infobip-Webhook] Unknown event type:', JSON.stringify(result).slice(0, 200));
}

async function handleDeliveryReport(result: Record<string, unknown>) {
  const messageId = result.messageId as string;
  const status = result.status as Record<string, unknown>;
  
  if (!messageId || !status) return;

  const groupName = ((status.groupName as string) || '').toUpperCase();
  const statusName = ((status.name as string) || '').toUpperCase();

  let mappedStatus: string | null = null;

  if (groupName === 'DELIVERED' || statusName === 'DELIVERED_TO_HANDSET') {
    mappedStatus = 'delivered';
  } else if (groupName === 'SEEN' || statusName === 'SEEN') {
    mappedStatus = 'read';
  } else if (groupName === 'REJECTED' || groupName === 'UNDELIVERABLE') {
    mappedStatus = 'failed';
  } else if (groupName === 'PENDING') {
    mappedStatus = 'sent';
  }

  if (!mappedStatus) return;

  console.log(`[Infobip-Webhook] Status update: ${messageId} -> ${mappedStatus}`);

  const updateData: Record<string, unknown> = { status: mappedStatus };
  if (mappedStatus === 'failed') {
    updateData.error_message = (status.description as string) || 'Delivery failed';
  }

  await dualUpdateMessage('message_id', messageId, updateData);

  // Update campaign_recipients if applicable
  if (mappedStatus === 'delivered' || mappedStatus === 'read') {
    await supabase
      .from('campaign_recipients')
      .update({
        status: mappedStatus,
        delivered_at: mappedStatus === 'delivered' ? new Date().toISOString() : undefined,
        read_at: mappedStatus === 'read' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('status', mappedStatus === 'read' ? 'delivered' : 'sent')
      .ilike('phone', `%${(result.to as string || '').replace(/\D/g, '').slice(-8)}%`);
  } else if (mappedStatus === 'failed') {
    const dest = (result.to as string || '').replace(/\D/g, '');
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'failed',
        error_message: (status.description as string) || 'Delivery failed',
        updated_at: new Date().toISOString(),
      })
      .in('status', ['sent', 'pending'])
      .ilike('phone', `%${dest.slice(-8)}%`);
  }
}

async function handleInboundMessage(result: Record<string, unknown>) {
  const messageId = result.messageId as string || `infobip_in_${Date.now()}`;
  // Infobip MO format uses "sender"/"destination" instead of "from"/"to"
  const from = (result.sender as string) || (result.from as string);
  const to = (result.destination as string) || (result.to as string);
  const receivedAt = result.receivedAt as string || new Date().toISOString();
  
  // Content can be: a single object (result.message), or an array (result.content)
  const contentArray = result.content as Record<string, unknown>[] | null;
  const messageObj = result.message as Record<string, unknown> | null;
  const message = messageObj || (Array.isArray(contentArray) && contentArray.length > 0 ? contentArray[0] : null);

  if (!from || !to) {
    console.error('[Infobip-Webhook] Missing from/to in inbound message');
    return;
  }

  const senderPhone = normalizePhone(from);
  const recipientPhone = normalizePhone(to);

  // Find channel by recipient (our number)
  const channel = await getChannelBySender(recipientPhone) as any;
  if (!channel) {
    console.error('[Infobip-Webhook] No channel found for:', recipientPhone);
    return;
  }

  // Extract message content
  let content = '';
  let messageType = 'text';
  let mediaUrl: string | null = null;

  if (message) {
    const msgType = (message.type as string || 'TEXT').toUpperCase();
    
    switch (msgType) {
      case 'TEXT':
        content = (message.text as string) || '';
        messageType = 'text';
        break;
      case 'BUTTON_REPLY':
        // Interactive button reply
        content = (message.text as string) || (message.payload as string) || '[Botão]';
        messageType = 'text';
        break;
      case 'LIST_REPLY':
        content = (message.text as string) || (message.title as string) || '[Lista]';
        messageType = 'text';
        break;
      case 'IMAGE':
        content = (message.caption as string) || '[Imagem]';
        mediaUrl = message.url as string || null;
        messageType = 'image';
        break;
      case 'VIDEO':
        content = (message.caption as string) || '[Vídeo]';
        mediaUrl = message.url as string || null;
        messageType = 'video';
        break;
      case 'AUDIO':
      case 'VOICE':
        content = '[Áudio]';
        mediaUrl = message.url as string || null;
        messageType = 'audio';
        break;
      case 'DOCUMENT':
        content = (message.caption as string) || (message.fileName as string) || '[Documento]';
        mediaUrl = message.url as string || null;
        messageType = 'document';
        break;
      case 'LOCATION':
        const lat = message.latitude;
        const lng = message.longitude;
        content = `📍 Localização: ${lat}, ${lng}`;
        messageType = 'location';
        break;
      case 'CONTACT':
        content = '[Contato]';
        messageType = 'contacts';
        break;
      case 'STICKER':
        content = '[Sticker]';
        mediaUrl = message.url as string || null;
        messageType = 'sticker';
        break;
      default:
        content = (message.text as string) || (message.payload as string) || `[${msgType}]`;
        messageType = 'text';
    }
  }

  // Check for existing message (dedup)
  const { data: existing } = await messageDb
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existing) {
    console.log('[Infobip-Webhook] Duplicate message, skipping:', messageId);
    return;
  }

  // Get or create lead
  const senderName = (result.contact as Record<string, unknown>)?.name as string || senderPhone;
  
  // Upsert lead
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, name')
    .eq('organization_id', channel.organization_id)
    .or(`phone.ilike.%${senderPhone.slice(-8)}%`)
    .maybeSingle();

  let leadId = existingLead?.id;

  if (!leadId) {
    const { data: newLead } = await supabase
      .from('leads')
      .insert({
        organization_id: channel.organization_id,
        name: senderName,
        phone: senderPhone,
        source: 'whatsapp_infobip',
      })
      .select('id')
      .single();
    leadId = newLead?.id;
  }

  // Store inbound message
  const msgData = {
    channel_id: channel.id,
    organization_id: channel.organization_id,
    message_id: messageId,
    sender_phone: senderPhone,
    sender_name: senderName,
    message_type: messageType,
    content,
    media_url: mediaUrl,
    direction: 'inbound',
    status: 'received',
    is_read: false,
    created_at: receivedAt,
    metadata: {
      provider: 'infobip',
      from,
      to,
    },
  };

  await dualWriteMessage(msgData);

  // Create or update conversation assignment
  const { data: existingAssignment } = await supabase
    .from('conversation_assignments')
    .select('id, status, is_bot_handling, bot_paused_until')
    .eq('channel_id', channel.id)
    .eq('conversation_phone', senderPhone)
    .maybeSingle();

  if (existingAssignment) {
    // Reopen if archived
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (existingAssignment.status === 'archived') {
      updates.status = 'in_progress';
    }

    if (leadId) {
      updates.lead_id = leadId;
    }

    await supabase
      .from('conversation_assignments')
      .update(updates)
      .eq('id', existingAssignment.id);
  } else {
    // Create new assignment
    await supabase
      .from('conversation_assignments')
      .insert({
        channel_id: channel.id,
        conversation_phone: senderPhone,
        lead_id: leadId,
        status: 'in_progress',
      });
  }

  console.log('[Infobip-Webhook] Inbound message processed:', messageId, 'from:', senderPhone);

  // Check business hours and send away message if needed
  if (channel.organization_id) {
    const { isOpen, awayMessage } = await isWithinBusinessHours(channel.organization_id);
    
    if (!isOpen && awayMessage) {
      // Check if we already sent an away message recently (within 6 hours)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentAway } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('channel_id', channel.id)
        .eq('direction', 'outbound')
        .eq('content', awayMessage)
        .gte('created_at', sixHoursAgo)
        .limit(1);

      if (!recentAway || recentAway.length === 0) {
        // Send away message via Infobip
        try {
          const infobipBaseUrl = channel.app_name;
          const infobipApiKey = channel.access_token;

          await fetch(`https://${infobipBaseUrl}/whatsapp/1/message/text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `App ${infobipApiKey}`,
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              messages: [{
                from: recipientPhone,
                to: senderPhone,
                content: { text: awayMessage },
              }],
            }),
          });

          // Store away message
          await dualWriteMessage({
            channel_id: channel.id,
            organization_id: channel.organization_id,
            message_id: `infobip_away_${Date.now()}`,
            sender_phone: recipientPhone,
            message_type: 'text',
            content: awayMessage,
            direction: 'outbound',
            status: 'sent',
            metadata: { destination: senderPhone, provider: 'infobip', auto_reply: true },
          });
        } catch (err) {
          console.error('[Infobip-Webhook] Error sending away message:', err);
        }
      }
    }
  }
}
