import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// =============================================
// IN-MEMORY CONFIG CACHE (30s TTL)
// Reduces DB hits for business hours, holidays, welcome messages
// =============================================
const configCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCacheKey(table: string, filter: Record<string, any>): string {
  return `${table}:${JSON.stringify(filter)}`;
}

async function getCached<T>(
  table: string,
  filter: Record<string, any>,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = getCacheKey(table, filter);
  const cached = configCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data as T;
  }
  const data = await fetchFn();
  configCache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  return data;
}

// =============================================
// SIGNATURE VERIFICATION
// =============================================
async function verifyMetaSignature(body: string, signature: string | null, appSecret: string): Promise<boolean> {
  if (!signature || !appSecret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hexSig = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hexSig === signature;
  } catch {
    return false;
  }
}

// =============================================
// PHONE NORMALIZATION
// =============================================
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
}

// =============================================
// BUSINESS HOURS CHECK (cached)
// =============================================
async function isWithinBusinessHours(organizationId: string): Promise<{ isOpen: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay();
  const currentTime = brazilTime.toTimeString().slice(0, 5);

  const businessHour = await getCached(
    `business_hours:${organizationId}:${dayOfWeek}`,
    { organizationId, dayOfWeek },
    async () => {
      const { data } = await supabase
        .from('business_hours')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();
      return data;
    }
  );

  if (!businessHour) return { isOpen: true, awayMessage: null };
  
  if (!businessHour.is_active) {
    const away = await getAwayMessage(organizationId);
    return { isOpen: false, awayMessage: away };
  }

  const startTime = businessHour.start_time.slice(0, 5);
  const endTime = businessHour.end_time.slice(0, 5);
  const isOpen = currentTime >= startTime && currentTime <= endTime;

  if (!isOpen) {
    const away = await getAwayMessage(organizationId);
    return { isOpen: false, awayMessage: away };
  }

  return { isOpen: true, awayMessage: null };
}

async function getAwayMessage(organizationId: string): Promise<string | null> {
  const config = await getCached(
    `away_msg:${organizationId}`,
    { organizationId },
    async () => {
      const { data } = await supabase
        .from('away_message_config')
        .select('message, is_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      return data;
    }
  );
  return config?.is_enabled ? config.message : null;
}

// =============================================
// HOLIDAY CHECK (cached)
// =============================================
async function isHoliday(organizationId: string): Promise<{ isHoliday: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = brazilTime.toISOString().slice(0, 10);
  const month = brazilTime.getMonth() + 1;
  const day = brazilTime.getDate();

  const holidays = await getCached(
    `holidays:${organizationId}`,
    { organizationId },
    async () => {
      const { data } = await supabase
        .from('holidays')
        .select('date, is_recurring')
        .eq('organization_id', organizationId);
      return data || [];
    }
  );

  const isHolidayToday = (holidays as any[]).some((h: any) => {
    if (h.is_recurring) {
      const holidayDate = new Date(h.date);
      return holidayDate.getMonth() + 1 === month && holidayDate.getDate() === day;
    }
    return h.date === today;
  });

  if (isHolidayToday) {
    const away = await getAwayMessage(organizationId);
    return { isHoliday: true, awayMessage: away };
  }

  return { isHoliday: false, awayMessage: null };
}

// =============================================
// WELCOME MESSAGE (cached)
// =============================================
async function shouldSendWelcomeMessage(
  organizationId: string, channelId: string, phone: string
): Promise<{ shouldSend: boolean; message: string | null }> {
  const config = await getCached(
    `welcome:${organizationId}`,
    { organizationId },
    async () => {
      const { data } = await supabase
        .from('welcome_message_config')
        .select('message, is_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      return data;
    }
  );

  if (!config?.is_enabled || !config.message) return { shouldSend: false, message: null };

  // Check if welcome already sent (check recent messages - last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentOutbound } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('channel_id', channelId)
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .or(`metadata->>destination.eq.${phone},metadata->>destination.eq.+${phone}`)
    .limit(1);

  if (recentOutbound && recentOutbound.length > 0) {
    return { shouldSend: false, message: null };
  }

  return { shouldSend: true, message: config.message };
}

// =============================================
// SEND WHATSAPP MESSAGE
// =============================================
async function sendWhatsAppMessage(
  phoneNumberId: string, accessToken: string, to: string, body: string
): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// =============================================
// DOWNLOAD AND STORE MEDIA
// =============================================
async function downloadAndStoreMedia(
  mediaId: string, accessToken: string, organizationId: string, mimeType: string
): Promise<string | null> {
  try {
    const mediaResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaResp.ok) return null;

    const mediaData = await mediaResp.json() as { url?: string };
    if (!mediaData.url) return null;

    const fileResp = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileResp.ok) return null;

    const buffer = await fileResp.arrayBuffer();
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${organizationId}/${Date.now()}_${mediaId}.${ext}`;

    const { error } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });

    if (error) return null;

    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (err) {
    console.error('Media download error:', err);
    return null;
  }
}

// =============================================
// FIND OR CREATE LEAD (optimized: suffix match)
// =============================================
async function findOrCreateLead(
  organizationId: string, userId: string, phone: string, name: string | null
): Promise<{ leadId: string; isNew: boolean }> {
  const normalized = normalizePhone(phone);
  const suffix8 = normalized.slice(-8);

  // Parallel: check exact match AND suffix match
  const [exactRes, suffixRes] = await Promise.all([
    supabase.from('leads').select('id').eq('organization_id', organizationId).eq('phone', normalized).limit(1),
    supabase.from('leads').select('id, phone').eq('organization_id', organizationId).ilike('phone', `%${suffix8}`).limit(5),
  ]);

  // Prefer exact
  if (exactRes.data && exactRes.data.length > 0) {
    return { leadId: exactRes.data[0].id, isNew: false };
  }

  // Suffix match
  if (suffixRes.data && suffixRes.data.length > 0) {
    return { leadId: suffixRes.data[0].id, isNew: false };
  }

  // Create new lead
  const leadName = name || `LeadWhats-${normalized.slice(-4)}`;
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      phone: normalized,
      name: leadName,
      status: 'new',
    })
    .select('id')
    .single();

  if (error || !newLead) {
    console.error('Error creating lead:', error);
    return { leadId: '', isNew: false };
  }

  return { leadId: newLead.id, isNew: true };
}

// =============================================
// CONVERSATION ASSIGNMENT (upsert)
// =============================================
async function handleConversationAssignment(
  organizationId: string, channelId: string, leadId: string, phone: string
): Promise<{ assignmentId: string; assignedTo: string | null; status: string; sectorId: string | null }> {
  const { data: existing } = await supabase
    .from('conversation_assignments')
    .select('id, assigned_to, status, sector_id')
    .eq('channel_id', channelId)
    .eq('conversation_phone', phone)
    .maybeSingle();

  if (existing) {
    // Reactivate archived conversations
    if (existing.status === 'archived') {
      const newStatus = existing.assigned_to ? 'in_progress' : 'pending';
      await supabase
        .from('conversation_assignments')
        .update({ status: newStatus, lead_id: leadId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      return { assignmentId: existing.id, assignedTo: existing.assigned_to, status: newStatus, sectorId: existing.sector_id };
    }
    // Update lead_id if missing
    if (!existing.assigned_to || leadId) {
      await supabase
        .from('conversation_assignments')
        .update({ lead_id: leadId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return { assignmentId: existing.id, assignedTo: existing.assigned_to, status: existing.status || 'pending', sectorId: existing.sector_id };
  }

  // Get sector from chatbot campaign or auto-assignment
  let sectorId: string | null = null;
  try {
    const { data: chatbotConfig } = await supabase
      .from('chatbot_config')
      .select('initial_stage_id')
      .eq('channel_id', channelId)
      .eq('is_enabled', true)
      .maybeSingle();
    // sector from chatbot config if available
    if (chatbotConfig?.initial_stage_id) {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('sector_id')
        .eq('id', chatbotConfig.initial_stage_id)
        .maybeSingle();
      sectorId = (stage as any)?.sector_id || null;
    }
  } catch { /* ignore */ }

  const { data: newAssignment, error } = await supabase
    .from('conversation_assignments')
    .insert({
      channel_id: channelId,
      conversation_phone: phone,
      lead_id: leadId,
      status: 'pending',
      sector_id: sectorId,
    })
    .select('id')
    .single();

  if (error || !newAssignment) {
    // Conflict — fetch existing
    const { data: fallback } = await supabase
      .from('conversation_assignments')
      .select('id, assigned_to, status, sector_id')
      .eq('channel_id', channelId)
      .eq('conversation_phone', phone)
      .maybeSingle();
    return {
      assignmentId: fallback?.id || '',
      assignedTo: fallback?.assigned_to || null,
      status: fallback?.status || 'pending',
      sectorId: fallback?.sector_id || null,
    };
  }

  return { assignmentId: newAssignment.id, assignedTo: null, status: 'pending', sectorId };
}

// =============================================
// INVOKE CHATBOT
// =============================================
async function invokeChatbot(
  channel: any, config: any, phone: string, name: string | null, content: string, msgId: string
) {
  const botType = config.bot_type || 'ai';
  const fnName = botType === 'flow' ? 'flow-bot-processor' : 'whatsapp-chatbot';

  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      channelId: channel.id,
      channel_id: channel.id,
      senderPhone: phone,
      contact_phone: phone,
      senderName: name,
      messageContent: content,
      message_text: content,
      messageId: msgId,
      organizationId: channel.organization_id,
      organization_id: channel.organization_id,
      flow_bot_id: config.flow_bot_id,
    }),
  });
}

// =============================================
// PROCESS INBOUND MESSAGE (parallelized)
// =============================================
async function processMessage(msg: any, channel: any, contactName: string | null) {
  const messageId = msg.id;
  const senderPhone = msg.from;
  const timestamp = msg.timestamp;
  const messageType = msg.type;

  const normalizedPhone = normalizePhone(senderPhone);

  // 1. Deduplicate (fastest check first)
  const { data: existingMessage } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingMessage) {
    console.log('Duplicate message, skipping:', messageId);
    return;
  }

  // 2. Extract content
  let content = '';
  let mediaId = '';
  let mediaMimeType = '';

  switch (messageType) {
    case 'text': content = msg.text?.body || ''; break;
    case 'image': content = msg.image?.caption || '[Imagem]'; mediaId = msg.image?.id || ''; mediaMimeType = msg.image?.mime_type || 'image/jpeg'; break;
    case 'video': content = msg.video?.caption || '[Vídeo]'; mediaId = msg.video?.id || ''; mediaMimeType = msg.video?.mime_type || 'video/mp4'; break;
    case 'audio': content = '[Áudio]'; mediaId = msg.audio?.id || ''; mediaMimeType = msg.audio?.mime_type || 'audio/ogg'; break;
    case 'document': content = msg.document?.filename || '[Documento]'; mediaId = msg.document?.id || ''; mediaMimeType = msg.document?.mime_type || 'application/octet-stream'; break;
    case 'sticker': content = '[Sticker]'; mediaId = msg.sticker?.id || ''; mediaMimeType = msg.sticker?.mime_type || 'image/webp'; break;
    case 'location': content = `[Localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`; break;
    case 'contacts': content = `[Contato: ${msg.contacts?.[0]?.name?.formatted_name || 'Contato'}]`; break;
    case 'button': content = msg.button?.text || '[Botão]'; break;
    case 'interactive': content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interativo]'; break;
    default: content = `[${messageType}]`;
  }

  // 3. PARALLEL TASKS: media download + lead/assignment + business logic
  const [storedMediaUrl, leadData, logicData] = await Promise.all([
    // Task A: Download media if applicable
    mediaId && channel.access_token
      ? downloadAndStoreMedia(mediaId, channel.access_token, channel.organization_id, mediaMimeType)
      : Promise.resolve(null),

    // Task B: Lead + Assignment (sequential internally, critical path)
    (async () => {
      const { leadId, isNew } = await findOrCreateLead(
        channel.organization_id,
        channel.user_id,
        senderPhone,
        contactName
      );
      const assignment = await handleConversationAssignment(
        channel.organization_id,
        channel.id,
        leadId,
        normalizedPhone
      );
      return { leadId, isNew, assignment };
    })(),

    // Task C: Business logic checks (parallel internally)
    (async () => {
      if (!channel.organization_id) return null;

      const [holidayCheck, businessCheck] = await Promise.all([
        isHoliday(channel.organization_id),
        isWithinBusinessHours(channel.organization_id),
      ]);

      if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
        return { actionToTake: 'holiday_away', messageToSend: holidayCheck.awayMessage };
      }
      if (!businessCheck.isOpen && businessCheck.awayMessage) {
        return { actionToTake: 'business_closed', messageToSend: businessCheck.awayMessage };
      }
      if (businessCheck.isOpen) {
        const welcomeCheck = await shouldSendWelcomeMessage(channel.organization_id, channel.id, normalizedPhone);
        if (welcomeCheck.shouldSend && welcomeCheck.message) {
          return { actionToTake: 'welcome', messageToSend: welcomeCheck.message };
        }
      }
      return null;
    })(),
  ]);

  // 4. Store message
  const finalMediaUrl = storedMediaUrl || (mediaId ? mediaId : null);

  const { error: insertError } = await supabase.from('whatsapp_messages').upsert({
    channel_id: channel.id,
    organization_id: channel.organization_id,
    message_id: messageId,
    sender_phone: normalizedPhone,
    sender_name: contactName,
    message_type: messageType,
    content,
    media_url: finalMediaUrl,
    direction: 'inbound',
    status: 'received',
    is_read: false,
    metadata: {
      timestamp,
      provider: 'meta',
      original_phone: senderPhone,
    },
  }, { onConflict: 'message_id', ignoreDuplicates: true });

  if (insertError) console.error('Error storing message:', insertError);
  else console.log('Message stored:', messageId);

  // 5. Execute logic action (away/welcome message)
  if (logicData?.messageToSend && channel.access_token) {
    const sent = await sendWhatsAppMessage(
      channel.app_name,
      channel.access_token,
      normalizedPhone,
      logicData.messageToSend
    );

    if (sent && logicData.actionToTake === 'welcome') {
      await supabase.from('whatsapp_messages').insert({
        channel_id: channel.id,
        message_id: `welcome_${normalizedPhone}_${Date.now()}`,
        sender_phone: channel.phone,
        sender_name: 'Sistema',
        message_type: 'text',
        content: logicData.messageToSend,
        direction: 'outbound',
        status: 'sent',
        organization_id: channel.organization_id,
        metadata: { provider: 'meta', welcome_message: true, destination: normalizedPhone },
      });
    }
  }

  // 6. Chatbot invocation (fire and forget — only if no logic action taken)
  if (!logicData?.actionToTake) {
    const chatbotConfig = await getCached(
      `chatbot:${channel.id}`,
      { channelId: channel.id },
      async () => {
        const { data } = await supabase
          .from('chatbot_config')
          .select('*')
          .eq('channel_id', channel.id)
          .eq('is_enabled', true)
          .maybeSingle();
        return data;
      }
    );

    if (chatbotConfig) {
      invokeChatbot(channel, chatbotConfig, normalizedPhone, contactName, content, messageId).catch(console.error);
    }
  }
}

// =============================================
// STATUS UPDATE HANDLER (read receipts, delivered)
// =============================================
async function processStatusUpdate(status: any) {
  const { id: messageId, status: msgStatus, timestamp } = status;

  if (!messageId || !msgStatus) return;

  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };

  const dbStatus = statusMap[msgStatus];
  if (!dbStatus) return;

  await supabase
    .from('whatsapp_messages')
    .update({ status: dbStatus, updated_at: new Date().toISOString() })
    .eq('message_id', messageId);
}

// =============================================
// MAIN SERVE HANDLER
// =============================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook verification (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token) {
      const { data } = await supabase
        .from('channels')
        .select('id')
        .eq('webhook_verify_token', token)
        .limit(1);
      if (data?.length) {
        return new Response(challenge, { status: 200 });
      }
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Webhook event (POST)
  if (req.method === 'POST') {
    try {
      const bodyText = await req.text();

      // Signature verification (optional but recommended)
      const signature = req.headers.get('x-hub-signature-256');
      const appSecret = Deno.env.get('META_APP_SECRET');
      if (appSecret) {
        const valid = await verifyMetaSignature(bodyText, signature, appSecret);
        if (!valid) {
          console.warn('Invalid Meta signature');
          // Don't reject — signature can be absent in dev/test
        }
      }

      const body = JSON.parse(bodyText);
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) return new Response('OK', { status: 200 });

      // Find channel by phone_number_id
      const metadata = value.metadata;
      let channel = null;

      if (metadata?.phone_number_id) {
        const { data } = await supabase
          .from('channels')
          .select('*')
          .eq('app_name', metadata.phone_number_id)
          .eq('provider', 'meta')
          .maybeSingle();
        channel = data;
      }

      if (!channel) {
        console.warn('Channel not found for phone_number_id:', metadata?.phone_number_id);
        return new Response('OK', { status: 200 });
      }

      // Build contact name map from contacts array
      const contactsMap = new Map<string, string>();
      if (value.contacts) {
        for (const c of value.contacts) {
          if (c.wa_id && c.profile?.name) {
            contactsMap.set(c.wa_id, c.profile.name);
          }
        }
      }

      // Process messages in parallel
      if (value.messages && value.messages.length > 0) {
        await Promise.all(
          value.messages.map((msg: any) =>
            processMessage(msg, channel, contactsMap.get(msg.from) || null)
          )
        );
      }

      // Process status updates in parallel
      if (value.statuses && value.statuses.length > 0) {
        await Promise.all(value.statuses.map(processStatusUpdate));
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Webhook error:', e);
      return new Response('Error', { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
