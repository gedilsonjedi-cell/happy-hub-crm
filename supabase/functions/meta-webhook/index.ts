import { createClient } from "npm:@supabase/supabase-js@2";
import { uploadToExternalMedia } from "../_shared/externalStorage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

// deno-lint-ignore no-explicit-any
const supabase: any = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// External DB is the SINGLE SOURCE OF TRUTH for whatsapp_messages
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
// deno-lint-ignore no-explicit-any
const externalSupabase: any = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

/** DB where whatsapp_messages live — external only, NO internal fallback */
// deno-lint-ignore no-explicit-any
const messageDb: any = externalSupabase;

function writeMessageRecord(
  // deno-lint-ignore no-explicit-any
  client: any,
  data: Record<string, unknown>,
  upsert: boolean
) {
  return upsert
    ? client.from('whatsapp_messages').upsert(data, { onConflict: 'message_id', ignoreDuplicates: true })
    : client.from('whatsapp_messages').insert(data);
}

/** Write to whatsapp_messages on external DB (no internal fallback) + update conversation_stats + upsert contact */
async function dualWriteMessage(data: Record<string, unknown>, upsert = false, internalChannelId?: string) {
  const result = await writeMessageRecord(messageDb, data, upsert);

  if (result.error) {
    console.error('[Meta-Webhook] Message write failed:', result.error);
  }

  // CUTOVER: write conversation_stats DIRECTLY to external (SSoT)
  if (!result.error && data.channel_id && data.direction) {
    const phone = data.direction === 'inbound'
      ? (data.sender_phone as string)
      : ((data.metadata as Record<string, unknown>)?.destination as string);
    if (phone && externalSupabase) {
      const statsChannelId = internalChannelId || data.channel_id;
      try {
        const { error: statsError } = await externalSupabase.rpc('upsert_conversation_stats_external', {
          _organization_id: (data.organization_id as string) || null,
          _channel_id: statsChannelId,
          _conversation_phone: phone,
          _content: (data.content as string) || null,
          _direction: data.direction as string,
          _is_read: (data.is_read as boolean) ?? null,
          _sender_name: (data.sender_name as string) || null,
          _created_at: new Date().toISOString(),
        });
        if (statsError) {
          console.error('[Stats] upsert_conversation_stats_external failed:', statsError.message, { statsChannelId, phone, direction: data.direction });
          await recoverConversationStatsExternal({
            organizationId: (data.organization_id as string) || null,
            channelId: statsChannelId,
            phone,
            content: (data.content as string) || '',
            direction: data.direction as string,
            isRead: (data.is_read as boolean) ?? false,
            senderName: (data.sender_name as string) || null,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (e: unknown) {
        console.error('[Stats] upsert_conversation_stats_external exception:', e);
        await recoverConversationStatsExternal({
          organizationId: (data.organization_id as string) || null,
          channelId: statsChannelId,
          phone,
          content: (data.content as string) || '',
          direction: data.direction as string,
          isRead: (data.is_read as boolean) ?? false,
          senderName: (data.sender_name as string) || null,
          createdAt: new Date().toISOString(),
        });
      }


      // Upsert contact in external DB (fire-and-forget)
      if (externalSupabase && data.direction === 'inbound') {
        externalSupabase
          .from('whatsapp_contacts')
          .upsert(
            {
              channel_id: data.channel_id,
              organization_id: (data.organization_id as string) || null,
              sender_phone: phone,
              sender_name: (data.sender_name as string) || null,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: 'channel_id,sender_phone', ignoreDuplicates: false }
          )
          .then(() => {})
          .catch((e: unknown) => console.warn('[Contact upsert] Error:', e));
      }
    }
  }

  return result;
}

/** Update whatsapp_messages on external DB only */
async function dualUpdateMessages(filter: { column: string; values: string[] }, updateData: Record<string, unknown>) {
  return await messageDb.from('whatsapp_messages').update(updateData).in(filter.column, filter.values);
}

const webhookDispatcherUrl = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/webhook-dispatcher`;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface IntegrationWebhookPayload {
  organization_id: string;
  event: 'message_created' | 'message_updated';
  data: Record<string, unknown>;
}

function runInBackground(promise: Promise<unknown>) {
  if (typeof (globalThis as any).EdgeRuntime?.waitUntil === 'function') {
    (globalThis as any).EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(() => {});
  }
}

// In-memory cache of orgs that have active webhooks (TTL 5 min)
const orgWebhookCache = new Map<string, { hasWebhooks: boolean; expiry: number }>();

async function orgHasActiveWebhooks(orgId: string): Promise<boolean> {
  const now = Date.now();
  const cached = orgWebhookCache.get(orgId);
  if (cached && cached.expiry > now) return cached.hasWebhooks;

  try {
    const { count, error } = await supabase
      .from('webhooks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1);

    const has = !error && (count ?? 0) > 0;
    orgWebhookCache.set(orgId, { hasWebhooks: has, expiry: now + 300_000 });
    return has;
  } catch {
    return false;
  }
}

async function dispatchIntegrationWebhook(payload: IntegrationWebhookPayload) {
  if (!payload.organization_id || !serviceRoleKey) return;

  // Only call dispatcher if org actually has webhooks configured
  const hasWebhooks = await orgHasActiveWebhooks(payload.organization_id);
  if (!hasWebhooks) return;

  try {
    const response = await fetch(webhookDispatcherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Meta-Webhook] Webhook dispatch failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('[Meta-Webhook] Webhook dispatch error:', error);
  }
}

// =============================================
// IN-MEMORY CONFIG CACHE (with jitter to avoid stampedes)
// =============================================
const configCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 30_000; // 30 seconds base
const CACHE_JITTER = 5_000; // ±5s jitter prevents simultaneous expiry storms

function cacheSet(key: string, data: unknown) {
  const jitter = Math.random() * CACHE_JITTER * 2 - CACHE_JITTER;
  configCache.set(key, { data, expiry: Date.now() + CACHE_TTL + jitter });
}

async function getCached<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const cached = configCache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data as T;
  const data = await fetchFn();
  cacheSet(key, data);
  return data;
}

// =============================================
// BULK CHANNEL CACHE (per phone_number_id)
// =============================================
const channelCache = new Map<string, { data: unknown; expiry: number }>();

async function getChannelByPhoneNumberId(phoneNumberId: string) {
  const cached = channelCache.get(phoneNumberId);
  if (cached && cached.expiry > Date.now()) return cached.data;
  const { data, error } = await supabase
    .from('channels')
    .select('id, organization_id, user_id, phone, name, app_name, access_token, provider, connected, updated_at')
    .eq('app_name', phoneNumberId)
    .eq('provider', 'meta')
    .eq('connected', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getChannelByPhoneNumberId] Failed to resolve active channel:', error.message, { phoneNumberId });
    return null;
  }

  // Only cache successful lookups — never cache null to avoid blocking status updates
  if (data) {
    const jitter = Math.random() * 10_000;
    channelCache.set(phoneNumberId, { data, expiry: Date.now() + 60_000 + jitter }); // 60s + jitter
  }
  return data;
}

// =============================================
// SIGNATURE VERIFICATION (blocking - rejects unauthorized requests)
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

async function isPhoneBlacklisted(organizationId: string, phone: string): Promise<boolean> {
  const clean = normalizePhone(phone);
  const suffix8 = clean.slice(-8);
  const { data, error } = await supabase
    .from('blacklist')
    .select('id')
    .eq('organization_id', organizationId)
    .or(`phone.eq.${clean},phone.eq.+${clean},phone.ilike.%${suffix8}`)
    .limit(1);
  if (error) {
    console.warn('[Meta-Webhook] Blacklist check failed:', error.message);
    return false;
  }
  return !!data?.length;
}

/** Generate Brazilian phone variants (with/without 9th digit) for matching */
function getPhoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const variants = [normalized];
  if (normalized.startsWith('55') && normalized.length >= 12) {
    const withoutCountry = normalized.slice(2);
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);
    // If has 9th digit (9 digits local), add variant without it
    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      variants.push(`55${areaCode}${localNumber.slice(1)}`);
    }
    // If missing 9th digit (8 digits local), add variant with it
    else if (localNumber.length === 8) {
      variants.push(`55${areaCode}9${localNumber}`);
    }
  }
  return variants;
}

// =============================================
// BUSINESS HOURS + HOLIDAY CHECK (single parallelized call, fully cached)
// =============================================
async function getOrganizationConfig(organizationId: string): Promise<{
  businessHours: Record<number, { is_active: boolean; start_time: string; end_time: string }>;
  holidays: Array<{ date: string; is_recurring: boolean }>;
  awayMessage: string | null;
  welcomeMessage: string | null;
  welcomeEnabled: boolean;
  chatbotConfigs: Map<string, unknown>;
}> {
  return getCached(`org_config:${organizationId}`, async () => {
    // Fetch all org config in parallel — ONE round trip per org per 30s
    const [bhRes, holidaysRes, awayRes, welcomeRes] = await Promise.all([
      supabase.from('business_hours').select('day_of_week, is_active, start_time, end_time').eq('organization_id', organizationId),
      supabase.from('holidays').select('date, is_recurring').eq('organization_id', organizationId),
      supabase.from('away_message_config').select('message, is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('welcome_message_config').select('message, is_enabled').eq('organization_id', organizationId).maybeSingle(),
    ]);

    const businessHours: Record<number, { is_active: boolean; start_time: string; end_time: string }> = {};
    for (const bh of bhRes.data || []) {
      businessHours[bh.day_of_week] = { is_active: bh.is_active, start_time: bh.start_time, end_time: bh.end_time };
    }

    return {
      businessHours,
      holidays: holidaysRes.data || [],
      awayMessage: awayRes.data?.is_enabled ? awayRes.data.message : null,
      welcomeMessage: welcomeRes.data?.message || null,
      welcomeEnabled: welcomeRes.data?.is_enabled || false,
      chatbotConfigs: new Map(),
    };
  });
}

function checkBusinessHoursSync(
  config: Awaited<ReturnType<typeof getOrganizationConfig>>
): { isOpen: boolean; awayMessage: string | null } {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay();
  const currentTime = brazilTime.toTimeString().slice(0, 5);

  const bh = config.businessHours[dayOfWeek];
  if (!bh) return { isOpen: true, awayMessage: null }; // No config = always open
  if (!bh.is_active) return { isOpen: false, awayMessage: config.awayMessage };

  const startTime = bh.start_time.slice(0, 5);
  const endTime = bh.end_time.slice(0, 5);
  const isOpen = currentTime >= startTime && currentTime <= endTime;

  return { isOpen, awayMessage: isOpen ? null : config.awayMessage };
}

function checkHolidaySync(
  config: Awaited<ReturnType<typeof getOrganizationConfig>>
): { isHoliday: boolean; awayMessage: string | null } {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = brazilTime.toISOString().slice(0, 10);
  const month = brazilTime.getMonth() + 1;
  const day = brazilTime.getDate();

  const isHolidayToday = config.holidays.some((h) => {
    if (h.is_recurring) {
      const d = new Date(h.date);
      return d.getMonth() + 1 === month && d.getDate() === day;
    }
    return h.date === today;
  });

  return {
    isHoliday: isHolidayToday,
    awayMessage: isHolidayToday ? config.awayMessage : null,
  };
}

// =============================================
// WELCOME MESSAGE — uses welcome_message_sent table (indexed)
// =============================================
async function hasWelcomeBeenSent(organizationId: string, phone: string): Promise<boolean> {
  const { data } = await supabase
    .from('welcome_message_sent')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('phone', phone)
    .maybeSingle();
  return !!data;
}

async function markWelcomeSent(organizationId: string, phone: string) {
  await supabase.from('welcome_message_sent').upsert(
    { organization_id: organizationId, phone, sent_at: new Date().toISOString() },
    { onConflict: 'organization_id,phone', ignoreDuplicates: true }
  );
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
    if (!mediaResp.ok) {
      const errText = await mediaResp.text().catch(() => '');
      console.error(`[Media] Failed to fetch media metadata for ${mediaId}: ${mediaResp.status} ${errText}`);
      return null;
    }

    const mediaData = await mediaResp.json() as { url?: string };
    if (!mediaData.url) {
      console.error(`[Media] No URL in media metadata for ${mediaId}`);
      return null;
    }

    const fileResp = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileResp.ok) {
      console.error(`[Media] Failed to download media ${mediaId}: ${fileResp.status}`);
      return null;
    }

    const buffer = await fileResp.arrayBuffer();
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${organizationId}/${Date.now()}_${mediaId}.${ext}`;

    const publicUrl = await uploadToExternalMedia(fileName, buffer, mimeType);
    if (!publicUrl) {
      console.error(`[Media] External storage upload failed for ${mediaId}`);
      return null;
    }
    console.log(`[Media] Stored ${mediaId} -> ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`[Media] Exception downloading ${mediaId}:`, err);
    return null;
  }
}

// =============================================
// FIND OR CREATE LEAD (parallel exact+suffix)
// =============================================
async function findOrCreateLead(
  organizationId: string, userId: string, phone: string, name: string | null
): Promise<{ leadId: string; isNew: boolean }> {
  const normalized = normalizePhone(phone);
  const suffix8 = normalized.slice(-8);

  // Parallel: exact + suffix in one round-trip
  const [exactRes, suffixRes] = await Promise.all([
    supabase.from('leads').select('id').eq('organization_id', organizationId).eq('phone', normalized).limit(1),
    supabase.from('leads').select('id').eq('organization_id', organizationId).ilike('phone', `%${suffix8}`).limit(1),
  ]);

  if (exactRes.data?.length) return { leadId: exactRes.data[0].id, isNew: false };
  if (suffixRes.data?.length) return { leadId: suffixRes.data[0].id, isNew: false };

  const leadName = name || `LeadWhats-${normalized.slice(-4)}`;
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({ organization_id: organizationId, user_id: userId, phone: normalized, name: leadName, status: 'new' })
    .select('id')
    .single();

  if (error || !newLead) {
    // Handle race condition: try to fetch the lead that was just created by another request
    const { data: fallback } = await supabase
      .from('leads').select('id').eq('organization_id', organizationId).eq('phone', normalized).maybeSingle();
    return { leadId: fallback?.id || '', isNew: false };
  }

  return { leadId: newLead.id, isNew: true };
}

// =============================================
// ROUND-ROBIN ATTENDANT ASSIGNMENT
// =============================================
async function getNextAvailableAttendant(
  organizationId: string,
  sectorId: string | null
): Promise<{ userId: string } | null> {
  if (!sectorId) return null;

  const { data: sectorUsers } = await supabase
    .from('user_sectors')
    .select('user_id')
    .eq('sector_id', sectorId);

  if (!sectorUsers || sectorUsers.length === 0) return null;

  const userIds = sectorUsers.map((u: { user_id: string }) => u.user_id);

  const { data: availableAttendants } = await supabase
    .from('attendant_availability')
    .select('user_id, last_assignment_at')
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .in('user_id', userIds)
    .order('last_assignment_at', { ascending: true, nullsFirst: true });

  if (!availableAttendants || availableAttendants.length === 0) return null;

  const nextAttendant = availableAttendants[0];

  // Update last_assignment_at (fire and forget)
  supabase
    .from('attendant_availability')
    .update({ last_assignment_at: new Date().toISOString() })
    .eq('user_id', nextAttendant.user_id)
    .eq('organization_id', organizationId)
    .then(() => {}, () => {});

  return { userId: nextAttendant.user_id };
}

// =============================================
// GLOBAL ROUND-ROBIN (for ad leads without sector — distributes to any online attendant)
// =============================================
async function getNextAvailableAttendantGlobal(
  organizationId: string
): Promise<{ userId: string } | null> {
  const { data: availableAttendants } = await supabase
    .from('attendant_availability')
    .select('user_id, last_assignment_at')
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .order('last_assignment_at', { ascending: true, nullsFirst: true });

  if (!availableAttendants || availableAttendants.length === 0) return null;

  const nextAttendant = availableAttendants[0];

  // Update last_assignment_at (fire and forget)
  supabase
    .from('attendant_availability')
    .update({ last_assignment_at: new Date().toISOString() })
    .eq('user_id', nextAttendant.user_id)
    .eq('organization_id', organizationId)
    .then(() => {}, () => {});

  return { userId: nextAttendant.user_id };
}

// =============================================
// CONVERSATION ASSIGNMENT (optimized upsert with round-robin)
// =============================================
async function handleConversationAssignment(
  channelId: string, leadId: string, normalizedPhone: string, organizationId: string, isFromAd: boolean = false
): Promise<{ assignmentId: string; assignedTo: string | null; status: string; sectorId: string | null; isBotHandling: boolean }> {
  const phoneVariants = getPhoneVariants(normalizedPhone);

  // Try exact match first, then variants
  let existing: { id: string; assigned_to: string | null; status: string; sector_id: string | null; is_bot_handling: boolean; lead_id?: string | null; conversation_phone?: string; updated_at?: string } | null = null;
  
  // CUTOVER: read/write conversation_assignments DIRECTLY on external (SSoT)
  const caDb = externalSupabase;
  const { data: exactMatch } = await caDb
    .from('conversation_assignments')
    .select('id, assigned_to, status, sector_id, is_bot_handling, lead_id, conversation_phone, updated_at')
    .eq('channel_id', channelId)
    .eq('conversation_phone', normalizedPhone)
    .maybeSingle();
  
  existing = exactMatch;
  
  // If no exact match, try phone variants (with/without 9th digit)
  if (!existing && phoneVariants.length > 1) {
    for (const variant of phoneVariants.slice(1)) {
      const { data: variantMatch } = await caDb
        .from('conversation_assignments')
        .select('id, assigned_to, status, sector_id, is_bot_handling, lead_id, conversation_phone, updated_at')
        .eq('channel_id', channelId)
        .eq('conversation_phone', variant)
        .maybeSingle();
      if (variantMatch) {
        existing = variantMatch;
        console.log(`[handleConversationAssignment] Found variant match: ${normalizedPhone} → ${variant} (assignment: ${variantMatch.id})`);
        break;
      }
    }
  }

  if (existing) {
    // Grace period: don't reactivate conversations archived less than 2 minutes ago
    // Only applies to MANUALLY archived conversations (has assigned_to), not campaign-created ones
    const wasRecentlyArchived = existing.status === 'archived' && existing.assigned_to && existing.updated_at &&
      (Date.now() - new Date(existing.updated_at).getTime()) < 2 * 60 * 1000;

    if (wasRecentlyArchived) {
      console.log(`[handleConversationAssignment] Skipping reactivation for recently archived conversation: ${normalizedPhone} (archived ${Math.round((Date.now() - new Date(existing.updated_at!).getTime()) / 1000)}s ago)`);
      return { assignmentId: existing.id, assignedTo: existing.assigned_to, status: existing.status, sectorId: existing.sector_id, isBotHandling: existing.is_bot_handling || false };
    }

    // Trigger update when: archived, missing lead, OR unassigned (e.g. campaign-created assignments)
    const needsUpdate = existing.status === 'archived' || !existing.lead_id || !existing.assigned_to;
    if (needsUpdate) {
      let assignedTo = existing.assigned_to;
      let newStatus = existing.status === 'archived'
        ? (assignedTo ? 'in_progress' : 'pending')
        : existing.status;

      if (!assignedTo && existing.sector_id) {
        const attendant = await getNextAvailableAttendant(organizationId, existing.sector_id);
        if (attendant) {
          assignedTo = attendant.userId;
          newStatus = 'in_progress';
          console.log(`[handleConversationAssignment] Round-robin assigned ${normalizedPhone} → ${assignedTo} (sector: ${existing.sector_id})`);
        }
      }

      // If still no attendant and this is from an ad, try global round-robin
      // Otherwise (no sector = no department campaign), leave as pending → "Novos"
      if (!assignedTo && isFromAd) {
        const attendant = await getNextAvailableAttendantGlobal(organizationId);
        if (attendant) {
          assignedTo = attendant.userId;
          newStatus = 'in_progress';
          console.log(`[handleConversationAssignment] Global round-robin assigned (ad lead) ${normalizedPhone} → ${assignedTo}`);
        }
      }

      await caDb
        .from('conversation_assignments')
        .update({ status: newStatus, lead_id: leadId, assigned_to: assignedTo, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      console.log(`[handleConversationAssignment] Updated conversation for ${normalizedPhone} → status=${newStatus}, assigned=${assignedTo} (sector: ${existing.sector_id})`);
      return { assignmentId: existing.id, assignedTo, status: newStatus, sectorId: existing.sector_id, isBotHandling: existing.is_bot_handling || false };
    }
    // Just bump updated_at to trigger realtime (fire and forget)
    caDb.from('conversation_assignments')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .then(() => {}, () => {});
    return { assignmentId: existing.id, assignedTo: existing.assigned_to, status: existing.status || 'pending', sectorId: existing.sector_id, isBotHandling: existing.is_bot_handling || false };
  }

  // New conversation — get sector from campaign history, then try round-robin
  // Try all phone variants to find campaign sector
  let sectorId: string | null = null;
  for (const variant of phoneVariants) {
    const campaignSectorResult = await supabase.rpc('get_campaign_sector_for_phone', {
      _organization_id: organizationId,
      _phone: variant,
    });
    if (campaignSectorResult.data) {
      sectorId = campaignSectorResult.data;
      break;
    }
  }

  let assignedTo: string | null = null;
  let finalStatus = 'pending';

  if (sectorId) {
    const attendant = await getNextAvailableAttendant(organizationId, sectorId);
    if (attendant) {
      assignedTo = attendant.userId;
      finalStatus = 'in_progress';
      console.log(`[handleConversationAssignment] New conv round-robin: ${normalizedPhone} → ${assignedTo} (sector: ${sectorId})`);
    }
  }

  // If from ad and still no attendant, try global round-robin
  if (!assignedTo && isFromAd) {
    const attendant = await getNextAvailableAttendantGlobal(organizationId);
    if (attendant) {
      assignedTo = attendant.userId;
      finalStatus = 'in_progress';
      console.log(`[handleConversationAssignment] Ad lead global round-robin (new): ${normalizedPhone} → ${assignedTo}`);
    }
  }

  const { data: newAssignment, error } = await caDb
    .from('conversation_assignments')
    .insert({ organization_id: organizationId, channel_id: channelId, conversation_phone: normalizedPhone, lead_id: leadId, status: finalStatus, sector_id: sectorId, assigned_to: assignedTo })
    .select('id')
    .single();

  if (error || !newAssignment) {
    // Race condition: fetch existing
    const { data: fallback } = await caDb
      .from('conversation_assignments')
      .select('id, assigned_to, status, sector_id, is_bot_handling')
      .eq('channel_id', channelId).eq('conversation_phone', normalizedPhone).maybeSingle();
    return {
      assignmentId: fallback?.id || '',
      assignedTo: fallback?.assigned_to || null,
      status: fallback?.status || 'pending',
      sectorId: fallback?.sector_id || null,
      isBotHandling: fallback?.is_bot_handling || false,
    };
  }

  return { assignmentId: newAssignment.id, assignedTo, status: finalStatus, sectorId, isBotHandling: false };
}

// =============================================
// CHATBOT CONFIG (per-channel cache, 60s TTL)
// =============================================
async function getChatbotConfig(channelId: string) {
  return getCached(`chatbot:${channelId}`, async () => {
    const { data } = await supabase
      .from('chatbot_config')
      .select('id, bot_type, flow_bot_id, is_enabled, auto_reply_when_unavailable')
      .eq('channel_id', channelId)
      .eq('is_enabled', true)
      .maybeSingle();
    return data;
  });
}

// =============================================
// INVOKE CHATBOT (fire and forget)
// =============================================
function invokeChatbot(channel: Record<string, unknown>, config: Record<string, unknown>, phone: string, name: string | null, content: string, msgId: string) {
  const botType = (config.bot_type as string) || 'ai';
  const fnName = botType === 'flow' ? 'flow-bot-processor' : 'whatsapp-chatbot';

  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      channelId: channel.id, channel_id: channel.id,
      senderPhone: phone, contact_phone: phone,
      senderName: name,
      messageContent: content, message_text: content,
      messageId: msgId,
      organizationId: channel.organization_id, organization_id: channel.organization_id,
      flow_bot_id: config.flow_bot_id,
    }),
  }).catch((e) => console.error('Chatbot invoke error:', e));
}

// =============================================
// EXTRACT MESSAGE CONTENT
// =============================================
function extractContent(msg: Record<string, unknown>): { content: string; mediaId: string; mediaMimeType: string } {
  const type = msg.type as string;
  switch (type) {
    case 'text': return { content: (msg.text as Record<string, string>)?.body || '', mediaId: '', mediaMimeType: '' };
    case 'image': return { content: (msg.image as Record<string, string>)?.caption || '[Imagem]', mediaId: (msg.image as Record<string, string>)?.id || '', mediaMimeType: (msg.image as Record<string, string>)?.mime_type || 'image/jpeg' };
    case 'video': return { content: (msg.video as Record<string, string>)?.caption || '[Vídeo]', mediaId: (msg.video as Record<string, string>)?.id || '', mediaMimeType: (msg.video as Record<string, string>)?.mime_type || 'video/mp4' };
    case 'audio': return { content: '[Áudio]', mediaId: (msg.audio as Record<string, string>)?.id || '', mediaMimeType: (msg.audio as Record<string, string>)?.mime_type || 'audio/ogg' };
    case 'document': return { content: (msg.document as Record<string, string>)?.filename || '[Documento]', mediaId: (msg.document as Record<string, string>)?.id || '', mediaMimeType: (msg.document as Record<string, string>)?.mime_type || 'application/octet-stream' };
    case 'sticker': return { content: '[Sticker]', mediaId: (msg.sticker as Record<string, string>)?.id || '', mediaMimeType: (msg.sticker as Record<string, string>)?.mime_type || 'image/webp' };
    case 'location': return { content: `[Localização: ${(msg.location as Record<string, unknown>)?.latitude}, ${(msg.location as Record<string, unknown>)?.longitude}]`, mediaId: '', mediaMimeType: '' };
    case 'contacts': return { content: `[Contato: ${((msg.contacts as Record<string, unknown>[])?.[0] as Record<string, Record<string, string>>)?.name?.formatted_name || 'Contato'}]`, mediaId: '', mediaMimeType: '' };
    case 'button': return { content: (msg.button as Record<string, string>)?.text || '[Botão]', mediaId: '', mediaMimeType: '' };
    case 'interactive': return { content: ((msg.interactive as Record<string, Record<string, string>>)?.button_reply?.title || (msg.interactive as Record<string, Record<string, string>>)?.list_reply?.title || '[Interativo]'), mediaId: '', mediaMimeType: '' };
    default: return { content: `[${type}]`, mediaId: '', mediaMimeType: '' };
  }
}

// =============================================
// PROCESS INBOUND MESSAGE (fully parallelized)
// =============================================
async function processMessage(msg: Record<string, unknown>, channel: Record<string, unknown>, contactName: string | null) {
  const messageId = msg.id as string;
  const senderPhone = msg.from as string;
  const timestamp = msg.timestamp;
  const messageType = msg.type as string;
  const normalizedPhone = normalizePhone(senderPhone);
  const organizationId = channel.organization_id as string;

  if (await isPhoneBlacklisted(organizationId, normalizedPhone)) {
    console.log('[processMessage] Ignoring inbound from blacklisted phone:', normalizedPhone);
    return;
  }

  // ── Extract Facebook/Instagram referral data (ads/click-to-WhatsApp) ──
  const referral = msg.referral as Record<string, unknown> | undefined;
  const referralData = referral ? {
    source_url: referral.source_url as string || null,
    source_type: referral.source_type as string || null,
    source_id: referral.source_id as string || null,
    headline: referral.headline as string || null,
    body: referral.body as string || null,
    media_type: referral.media_type as string || null,
    image_url: referral.image_url as string || null,
    video_url: referral.video_url as string || null,
    thumbnail_url: referral.thumbnail_url as string || null,
    ctwa_clid: referral.ctwa_clid as string || null,
  } : null;

  if (referralData) {
    console.log(`[processMessage] Facebook/Instagram referral detected for ${normalizedPhone}:`, JSON.stringify(referralData));
  }

  // Guard: ignore messages sent BY the channel itself (outbound echo/status events misrouted as inbound)
  // This prevents ghost "pending" conversations from delivery receipts
  const channelPhone = ((channel.phone as string) || '').replace(/\D/g, '');
  const senderDigits = senderPhone.replace(/\D/g, '');
  if (channelPhone && (senderDigits === channelPhone || senderDigits.endsWith(channelPhone.slice(-8)))) {
    console.log('[processMessage] Ignoring outbound echo from channel phone:', senderPhone);
    return;
  }

  // context.id is the message being replied to (e.g. customer replying to our template).
  // It is NOT an echo — echoes are filtered above by checking the sender phone vs channel phone.
  const context = msg.context as Record<string, unknown> | undefined;
  const echoedMessageId = typeof context?.id === 'string' ? context.id : null;

  // ── PHASE 1: Parallel pre-checks ─────────────────────────────────
  // Run all lookups simultaneously before any business logic
  const [existingMessage, orgConfig, chatbotConfig] = await Promise.all([
    // Dedup check (uses message_id unique constraint)
    messageDb.from('whatsapp_messages').select('id').eq('message_id', messageId).maybeSingle(),
    // All org config in ONE cached fetch (business hours + holidays + away + welcome)
    getOrganizationConfig(organizationId),
    // Chatbot config (cached per channel)
    getChatbotConfig(channel.id as string),
  ]);

  if (existingMessage.data) {
    console.log('Duplicate message, skipping:', messageId);
    return;
  }

  // ── PHASE 2: Parallel async work ─────────────────────────────────
  const { content, mediaId, mediaMimeType } = extractContent(msg);

  // Evaluate business logic synchronously from cache (zero DB calls)
  const holidayStatus = checkHolidaySync(orgConfig);
  const businessStatus = checkBusinessHoursSync(orgConfig);

  const isBlocked = (holidayStatus.isHoliday && !!holidayStatus.awayMessage) ||
    (!businessStatus.isOpen && !!businessStatus.awayMessage);

  // Determine away message
  const awayMessageToSend = holidayStatus.isHoliday
    ? holidayStatus.awayMessage
    : !businessStatus.isOpen
    ? businessStatus.awayMessage
    : null;

  // Start all parallel tasks simultaneously
  const [storedMediaUrl, leadData, welcomeAlreadySent] = await Promise.all([
    // Task A: Download media (independent)
    mediaId && channel.access_token
      ? downloadAndStoreMedia(mediaId, channel.access_token as string, organizationId, mediaMimeType)
      : Promise.resolve(null),

    // Task B: Lead upsert + conversation assignment (sequential internally)
    (async () => {
      const { leadId } = await findOrCreateLead(organizationId, channel.user_id as string, senderPhone, contactName);
      const assignment = await handleConversationAssignment(channel.id as string, leadId, normalizedPhone, organizationId, !!referralData);
      return { leadId, assignment };
    })(),

    // Task C: Check if welcome was already sent (only if needed)
    orgConfig.welcomeEnabled && !isBlocked
      ? hasWelcomeBeenSent(organizationId, normalizedPhone)
      : Promise.resolve(true), // treat as "sent" to skip
  ]);

  // ── PHASE 3: Persist message ──────────────────────────────────────
  // IMPORTANT: only store actual public URLs in media_url. If download failed,
  // keep the Meta media_id in metadata so the UI can request it on demand.
  const finalMediaUrl = storedMediaUrl;

  const { error: insertError } = await dualWriteMessage({
    channel_id: channel.id as string,
    organization_id: organizationId,
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
      timestamp, provider: 'meta', original_phone: senderPhone, lead_id: leadData?.leadId || null,
      channel_phone: channel.phone || null,
      context_message_id: echoedMessageId,
      ...(mediaId ? { media_id: mediaId, media_mime_type: mediaMimeType } : {}),
      ...(referralData ? { referral: referralData } : {}),
    },
  }, true, channel.id as string);

  if (insertError) {
    console.error('Error storing message:', insertError);
  } else if (organizationId) {
    runInBackground(
      dispatchIntegrationWebhook({
        organization_id: organizationId,
        event: 'message_created',
        data: {
          message_id: messageId,
          phone: normalizedPhone,
          sender_name: contactName,
          content,
          direction: 'inbound',
          status: 'received',
          channel_id: channel.id,
          channel_name: channel.name || null,
          channel_phone: channel.phone || null,
          message_type: messageType,
          media_url: finalMediaUrl,
          lead_id: leadData?.leadId || null,
          provider: 'meta',
          timestamp,
        },
      })
    );
  }

  // ── PHASE 3.5: Track button clicks for campaign recipients ─────────
  if (messageType === 'button' || messageType === 'interactive') {
    const buttonText = content; // Already extracted by extractContent
    const suffix8 = normalizedPhone.slice(-8);
    
    // Find campaign_recipient that was sent/delivered/read to this phone (most recent campaign)
    supabase
      .from('campaign_recipients')
      .update({
        button_clicked: buttonText,
        button_clicked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .is('button_clicked', null)
      .in('status', ['sent', 'delivered', 'read'])
      .or(`phone.like.%${suffix8}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(
        ({ error: btnError }: { error: unknown }) => {
          if (btnError) {
            console.error('[Webhook] Error updating button_clicked:', btnError);
          } else {
            console.log(`[Webhook] 🔘 Button click tracked: "${buttonText}" from ${normalizedPhone}`);
          }
        },
        (e: unknown) => console.error(e)
      );
  }

  // ── PHASE 4: Post-processing actions (fire and forget where possible) ─
  if (awayMessageToSend && channel.access_token) {
    // Send away message (await for reliability, then store record)
    sendWhatsAppMessage(
      channel.app_name as string,
      channel.access_token as string,
      normalizedPhone,
      awayMessageToSend
    ).then((sent) => {
      if (sent) {
        dualWriteMessage({
          channel_id: channel.id as string,
          message_id: `away_${normalizedPhone}_${Date.now()}`,
          sender_phone: channel.phone,
          sender_name: 'Sistema',
          message_type: 'text',
          content: awayMessageToSend,
          direction: 'outbound',
          status: 'sent',
          organization_id: organizationId,
          metadata: { provider: 'meta', away_message: true, destination: normalizedPhone },
        }, false, channel.id as string).then(() => {}, () => {});
      }
    }).catch(console.error);
    return; // Don't invoke chatbot when away
  }

  // Welcome message (not blocked, not sent before)
  if (businessStatus.isOpen && orgConfig.welcomeEnabled && orgConfig.welcomeMessage && !welcomeAlreadySent && channel.access_token) {
    sendWhatsAppMessage(
      channel.app_name as string,
      channel.access_token as string,
      normalizedPhone,
      orgConfig.welcomeMessage
    ).then((sent) => {
      if (sent) {
        // Mark as sent + store outbound record in parallel
        Promise.all([
          markWelcomeSent(organizationId, normalizedPhone),
          dualWriteMessage({
            channel_id: channel.id as string,
            message_id: `welcome_${normalizedPhone}_${Date.now()}`,
            sender_phone: channel.phone,
            sender_name: 'Sistema',
            message_type: 'text',
            content: orgConfig.welcomeMessage!,
            direction: 'outbound',
            status: 'sent',
            organization_id: organizationId,
            metadata: { provider: 'meta', welcome_message: true, destination: normalizedPhone },
          }, false, channel.id as string),
        ]).catch(console.error);
      }
    }).catch(console.error);
  }

  // Chatbot invocation (fire and forget)
  if (chatbotConfig) {
    invokeChatbot(channel, chatbotConfig as Record<string, unknown>, normalizedPhone, contactName, content, messageId);
  }
}

// =============================================
// AUTO-PAUSE CAMPAIGNS ON QUALITY SIGNALS
// =============================================
async function checkAndPauseOnQualitySignal(channelId: string, reason: string) {
  // Find all running campaigns that use this channel
  const { data: campaignChannelsData } = await supabase
    .from('campaign_channels')
    .select('campaign_id')
    .eq('channel_id', channelId);

  if (!campaignChannelsData || campaignChannelsData.length === 0) return;

  const campaignIds = campaignChannelsData.map((cc: { campaign_id: string }) => cc.campaign_id);

  // Pause all running campaigns for these channels
  // SKIP campaigns where the user already acknowledged the quality risk
  const { data: pausedCampaigns, error } = await supabase
    .from('campaigns')
    .update({
      status: 'paused',
      // Keep as false here: only explicit user resume should acknowledge risk.
      quality_pause_acknowledged: false,
      updated_at: new Date().toISOString(),
    })
    .in('id', campaignIds)
    .eq('status', 'running')
    .eq('quality_pause_acknowledged', false)
    .select('id, name');

  if (pausedCampaigns && pausedCampaigns.length > 0) {
    console.log(`[Webhook] ⚠️ AUTO-PAUSED ${pausedCampaigns.length} campaign(s) due to quality signal: ${reason}`);
    for (const c of pausedCampaigns) {
      console.log(`[Webhook]   → Paused campaign: ${c.name} (${c.id})`);
    }
  }
}

// =============================================
// BATCH STATUS UPDATES (avoids per-update queries)
// =============================================
async function processStatusUpdates(statuses: Record<string, unknown>[]) {
  const statusMap: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
  
  // Group by status to batch updates
  const grouped = new Map<string, string[]>();
  // Track error info for failed messages
  const failedErrorMap = new Map<string, { error_message: string; error_code: string }>();
  
  for (const s of statuses) {
    const msgId = s.id as string;
    const dbStatus = statusMap[s.status as string];
    if (!msgId || !dbStatus) continue;
    if (!grouped.has(dbStatus)) grouped.set(dbStatus, []);
    grouped.get(dbStatus)!.push(msgId);
    
    // Capture error details for failed messages
    if (dbStatus === 'failed') {
      const errors = s.errors as Record<string, unknown>[] | undefined;
      const errCode = String(errors?.[0]?.code || 'UNKNOWN');
      const errTitle = String(errors?.[0]?.title || 'Unknown error');
      console.log(`[Webhook] ❌ Message ${msgId} failed - Code: ${errCode}, Title: ${errTitle}, Errors: ${JSON.stringify(errors)}`);
      failedErrorMap.set(msgId, { error_message: `(#${errCode}) ${errTitle}`, error_code: errCode });
    }
  }

  // ─── QUALITY SIGNAL DETECTION ───────────────────────────────────────
  // Check for errors that indicate quality/template issues that should pause campaigns
  for (const s of statuses) {
    if (s.status !== 'failed') continue;
    const errors = s.errors as Record<string, unknown>[] | undefined;
    if (!errors || errors.length === 0) continue;

    for (const err of errors) {
      const code = String(err.code || '');
      const title = String(err.title || '').toLowerCase();

      // Quality-related error codes that should trigger auto-pause:
      // 131049 - Marketing message rate limit (phone quality too low)
      // 131031 - Account restricted / flagged
      // 368 - Temporarily blocked for policy violation
      // 131056 - Template paused due to quality
      // 132015 - Template paused
      // 131057 - Account flagged
      const qualityErrorCodes = ['131049', '131031', '368', '131056', '132015', '131057'];
      const qualityKeywords = ['quality', 'flagged', 'paused', 'restricted', 'spam', 'blocked for policy'];

      const isQualityIssue = qualityErrorCodes.includes(code) ||
        qualityKeywords.some(kw => title.includes(kw));

      if (isQualityIssue) {
        // Find which channel this message belongs to
        const { data: msg } = await messageDb
          .from('whatsapp_messages')
          .select('channel_id')
          .eq('message_id', s.id as string)
          .maybeSingle();

        if (msg?.channel_id) {
          const reason = `Error ${code}: ${err.title || 'Quality signal detected'}`;
          console.log(`[Webhook] 🚨 Quality signal detected! Code: ${code}, Title: ${err.title}`);
          await checkAndPauseOnQualitySignal(msg.channel_id, reason);
        }
        break; // One pause per status batch is enough
      }
    }
  }

  // For failed messages, also save error_message individually
  const updatePromisesWm: Promise<unknown>[] = [];
  for (const [status, ids] of grouped.entries()) {
    if (status === 'failed') {
      // Update failed messages individually to include error_message
      for (const id of ids) {
        const errInfo = failedErrorMap.get(id);
        updatePromisesWm.push(
          dualUpdateMessages(
            { column: 'message_id', values: [id] },
            { 
              status: 'failed', 
              error_message: errInfo?.error_message || 'Falha reportada pela Meta',
              updated_at: new Date().toISOString() 
            }
          )
        );
      }
    } else {
      updatePromisesWm.push(
        dualUpdateMessages(
          { column: 'message_id', values: ids },
          { status, updated_at: new Date().toISOString() }
        )
      );
    }
  }
  await Promise.all(updatePromisesWm);

  // ─── SYNC CAMPAIGN RECIPIENTS ─────────────────────────────────────────
  const relevantStatuses = ['delivered', 'read', 'failed'];
  const relevantGroups = Array.from(grouped.entries()).filter(([status]) => relevantStatuses.includes(status));

  if (relevantGroups.length === 0) return;

  const allRelevantIds: string[] = relevantGroups.flatMap(([, ids]) => ids);

  // Try to find messages in external DB — may fail if background write hasn't completed yet
  let messages: Record<string, unknown>[] | null = null;
  const { data: messagesData } = await messageDb
    .from('whatsapp_messages')
    .select('message_id, status, metadata, organization_id, channel_id, error_message')
    .in('message_id', allRelevantIds)
    .eq('direction', 'outbound');
  messages = messagesData;

  // Dispatch integration webhooks only if org has active webhooks
  if (messages && messages.length > 0) {
    // Check if ANY org in this batch has webhooks before doing channel lookup
    const orgIds = [...new Set(messages.map(m => m.organization_id).filter(Boolean))] as string[];
    const orgsWithWebhooks = (await Promise.all(
      orgIds.map(async (oid) => ({ id: oid, has: await orgHasActiveWebhooks(oid) }))
    )).filter(o => o.has).map(o => o.id);

    if (orgsWithWebhooks.length > 0) {
      const msgsToDispatch = messages.filter(m => orgsWithWebhooks.includes(m.organization_id as string));
      const uniqueChannelIds = [...new Set(msgsToDispatch.map(m => m.channel_id).filter(Boolean))];
      const channelMap = new Map<string, { name: string; phone: string }>();
      if (uniqueChannelIds.length > 0) {
        const { data: channels } = await supabase
          .from('channels')
          .select('id, name, phone')
          .in('id', uniqueChannelIds);
        channels?.forEach((ch: { id: string; name: string; phone: string }) =>
          channelMap.set(ch.id, { name: ch.name, phone: ch.phone })
        );
      }

      const dispatchPromises = msgsToDispatch.map((msg) => {
        const metadata = (msg.metadata || {}) as Record<string, unknown>;
        const chInfo = msg.channel_id ? channelMap.get(String(msg.channel_id)) : null;
        return dispatchIntegrationWebhook({
          organization_id: msg.organization_id as string,
          event: 'message_updated',
          data: {
            message_id: msg.message_id,
            status: msg.status,
            channel_id: msg.channel_id,
            channel_name: chInfo?.name || null,
            channel_phone: chInfo?.phone || null,
            destination: metadata.destination || null,
            campaign_id: metadata.campaignId || null,
            error_message: msg.error_message || null,
            provider: 'meta',
          },
        });
      });

      if (dispatchPromises.length > 0) {
        runInBackground(Promise.allSettled(dispatchPromises));
      }
    }
  }

  // ─── CAMPAIGN RECIPIENTS SYNC ──────────────────────────────────────────
  // Build a map of message_id → campaignId+destination from whatsapp_messages
  const msgMetaMap = new Map<string, { campaignId: string; destination: string }>();
  if (messages) {
    for (const msg of messages) {
      const metadata = (msg.metadata || {}) as Record<string, unknown>;
      const campaignId = metadata.campaignId as string | null;
      const destination = metadata.destination as string | null;
      if (campaignId && destination && msg.message_id) {
        msgMetaMap.set(msg.message_id as string, { campaignId, destination });
      }
    }
  }

  // FALLBACK: For messages not found in DB (race condition with background writes),
  // use recipient_id from the status payload to match campaign_recipients directly.
  // This handles the case where meta-send writes asynchronously and the status
  // callback arrives before the DB write completes.
  const unmatchedStatuses: { msgId: string; recipientPhone: string; status: string }[] = [];
  for (const s of statuses) {
    const msgId = s.id as string;
    const dbStatus = statusMap[s.status as string];
    if (!msgId || !dbStatus || !relevantStatuses.includes(dbStatus)) continue;
    if (msgMetaMap.has(msgId)) continue; // Already matched via DB
    const recipientId = s.recipient_id as string;
    if (recipientId) {
      unmatchedStatuses.push({ msgId, recipientPhone: recipientId.replace(/\D/g, ''), status: dbStatus });
    }
  }

  const updatePromises: Promise<unknown>[] = [];

  // Update campaign_recipients from matched messages (DB lookup succeeded)
  for (const [, meta] of msgMetaMap.entries()) {
    const cleanPhone = meta.destination.replace(/\D/g, '');
    const suffix8 = cleanPhone.slice(-8);
    const suffix11 = cleanPhone.slice(-11);
    const campaignId = meta.campaignId;

    // Find the actual status for this message from the grouped map
    let recipientStatus: string | null = null;
    for (const [status, ids] of grouped.entries()) {
      if (ids.some(id => {
        const m = messages?.find(x => (x.message_id as string) === id);
        return m && (m.metadata as Record<string, unknown>)?.campaignId === campaignId &&
               (m.metadata as Record<string, unknown>)?.destination === meta.destination;
      })) {
        recipientStatus = status;
        break;
      }
    }
    if (!recipientStatus || !relevantStatuses.includes(recipientStatus)) continue;

    if (recipientStatus === 'delivered') {
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('status', 'sent')
        .or(`phone.like.%${suffix8},phone.like.%${suffix11}`)
      );
    } else if (recipientStatus === 'read') {
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'read',
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .in('status', ['sent', 'delivered'])
        .or(`phone.like.%${suffix8},phone.like.%${suffix11}`)
      );
    } else if (recipientStatus === 'failed') {
      const errorDetails = statuses.find(s => {
        const m = messages?.find(x => (x.metadata as Record<string, unknown>)?.campaignId === campaignId);
        return m && s.id === (m.message_id as string);
      });
      const errorMsg = (errorDetails?.errors as Record<string, unknown>[])?.[0]?.title as string || 'Falha reportada pela Meta';
      const errorCode = String((errorDetails?.errors as Record<string, unknown>[])?.[0]?.code || 'WEBHOOK_FAILED');
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'failed',
          error_message: errorMsg,
          last_error_code: errorCode,
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .in('status', ['sent', 'delivered'])
        .or(`phone.like.%${suffix8},phone.like.%${suffix11}`)
      );
    }
  }

  // FALLBACK: Update campaign_recipients directly using phone from status payload
  // when the whatsapp_messages record wasn't found (race condition)
  for (const unmatched of unmatchedStatuses) {
    const suffix8 = unmatched.recipientPhone.slice(-8);
    const suffix11 = unmatched.recipientPhone.slice(-11);
    const phoneFilter = `phone.like.%${suffix8},phone.like.%${suffix11}`;

    if (unmatched.status === 'delivered') {
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('status', 'sent')
        .or(phoneFilter)
      );
    } else if (unmatched.status === 'read') {
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'read',
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('status', ['sent', 'delivered'])
        .or(phoneFilter)
      );
    } else if (unmatched.status === 'failed') {
      const errorDetails = statuses.find(s => s.id === unmatched.msgId);
      const errorMsg = (errorDetails?.errors as Record<string, unknown>[])?.[0]?.title as string || 'Falha reportada pela Meta';
      const errorCode = String((errorDetails?.errors as Record<string, unknown>[])?.[0]?.code || 'WEBHOOK_FAILED');
      updatePromises.push(
        supabase.from('campaign_recipients').update({
          status: 'failed',
          error_message: errorMsg,
          last_error_code: errorCode,
          updated_at: new Date().toISOString()
        })
        .in('status', ['sent', 'delivered'])
        .or(phoneFilter)
      );
    }
  }

  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
    console.log(`[Webhook] Updated ${updatePromises.length} campaign_recipients (${unmatchedStatuses.length} via fallback)`);
  }
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
      if (data?.length) return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Webhook event (POST)
  if (req.method === 'POST') {
    const bodyText = await req.text();

    // Signature verification (BLOCKING - rejects unauthorized requests)
    const appSecret = Deno.env.get('META_APP_SECRET');
    if (appSecret) {
      const signature = req.headers.get('x-hub-signature-256');
      const isValid = await verifyMetaSignature(bodyText, signature, appSecret);
      if (!isValid) {
        console.error('[Webhook] REJECTED: Invalid Meta signature from', req.headers.get('x-forwarded-for') || 'unknown');
        return new Response('Unauthorized', { status: 401 });
      }
    } else {
      console.warn('[Webhook] META_APP_SECRET not configured - signature verification skipped');
    }

    // Return 200 immediately to Meta — process in background to prevent timeouts
    const processingPromise = (async () => {
      try {
        const body = JSON.parse(bodyText);
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value) return;

        const metadata = value.metadata;
        if (!metadata?.phone_number_id) return;

        // Process status updates independently of channel lookup
        const statusPromise = value.statuses?.length
          ? processStatusUpdates(value.statuses)
          : Promise.resolve();

        const channel = await getChannelByPhoneNumberId(metadata.phone_number_id);

        let messagePromise: Promise<unknown> = Promise.resolve();
        if (value.messages?.length) {
          if (!channel) {
            console.warn('Channel not found for phone_number_id:', metadata.phone_number_id, '- skipping inbound messages but status updates still processed');
          } else {
            const contactsMap = new Map<string, string>();
            if (value.contacts) {
              for (const c of value.contacts) {
                if (c.wa_id && c.profile?.name) contactsMap.set(c.wa_id, c.profile.name);
              }
            }
            messagePromise = Promise.all(value.messages.map((msg: Record<string, unknown>) =>
              processMessage(msg, channel as Record<string, unknown>, contactsMap.get(msg.from as string) || null)
            ));
          }
        }

        await Promise.all([statusPromise, messagePromise]);
      } catch (e) {
        console.error('Webhook processing error:', e);
      }
    })();

    // Fire-and-forget: let Deno keep running in background
    runInBackground(processingPromise);

    // Return 200 to Meta IMMEDIATELY — do NOT await processing
    return new Response('OK', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
