import { createClient } from "npm:@supabase/supabase-js@2";
import { uploadToExternalMedia } from "../_shared/externalStorage.ts";
import { maybeAutoBlacklist } from "../_shared/autoBlacklist.ts";
import { isNotWantedLabel } from "../_shared/notWantedButton.ts";
import { classifyLeadIntent, DECLINE_MESSAGE, isFirstInboundContact } from "../_shared/leadIntent.ts";

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

async function recoverConversationStatsExternal(params: {
  organizationId: string | null;
  channelId: string | null;
  phone: string;
  content: string;
  direction: string;
  isRead: boolean;
  senderName: string | null;
  createdAt: string;
}) {
  if (!externalSupabase || !params.organizationId || !params.channelId || !params.phone) return;

  const normalized = normalizePhone(params.phone);

  // Lookup determinístico. Se a LEITURA falhar, abortamos: criar uma linha nova
  // aqui geraria conversa duplicada e o atendimento "sumiria" do dono atual.
  let assignment: Record<string, any> | null = null;
  try {
    assignment = await findAssignmentByPhone(
      externalSupabase,
      params.channelId,
      normalized,
      'id, organization_id, conversation_phone, assigned_to, status, updated_at, created_at'
    );
  } catch (e) {
    console.error('[Stats] assignment lookup failed — abortando recovery (sem criar duplicata):', (e as Error).message, { channelId: params.channelId, phone: normalized });
    return;
  }

  if (!assignment && params.direction === 'inbound') {
    const { data, error: insErr } = await externalSupabase
      .from('conversation_assignments')
      .insert({
        organization_id: params.organizationId,
        channel_id: params.channelId,
        conversation_phone: normalized,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .select('id, conversation_phone, organization_id')
      .maybeSingle();
    if (insErr) {
      // Corrida: outra requisição criou a linha. Reler em vez de duplicar.
      console.warn('[Stats] assignment insert falhou, relendo:', insErr.message);
      try {
        assignment = await findAssignmentByPhone(
          externalSupabase,
          params.channelId,
          normalized,
          'id, organization_id, conversation_phone, assigned_to, status, updated_at, created_at'
        );
      } catch {
        return;
      }
    } else {
      assignment = data;
    }
  }

  if (!assignment?.id) return;

  if (!assignment.organization_id) {
    await externalSupabase
      .from('conversation_assignments')
      .update({ organization_id: params.organizationId, updated_at: new Date().toISOString() })
      .eq('id', assignment.id);
  }

  const statRow = {
    assignment_id: assignment.id,
    channel_id: params.channelId,
    conversation_phone: assignment.conversation_phone || normalized,
    organization_id: params.organizationId,
    last_message_content: params.content,
    last_message_at: params.createdAt,
    last_inbound_at: params.direction === 'inbound' ? params.createdAt : null,
    unread_count: params.direction === 'inbound' && !params.isRead ? 1 : 0,
    sender_name: params.direction === 'inbound' ? params.senderName : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await externalSupabase
    .from('conversation_stats')
    .upsert(statRow, { onConflict: 'assignment_id' });

  if (error) {
    console.error('[Stats] recovery upsert failed:', error.message, { channelId: params.channelId, phone: normalized, assignmentId: assignment.id });
  } else {
    console.log('[Stats] recovery upsert ok:', { channelId: params.channelId, phone: normalized, assignmentId: assignment.id });
  }
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

// Multiple Meta apps can point to this webhook (legacy app + Embedded Signup app).
// Verify against every configured secret before rejecting.
async function verifyAnyMetaSignature(body: string, signature: string | null): Promise<boolean> {
  const secrets = [
    Deno.env.get('META_APP_SECRET'),
    Deno.env.get('META_WEBHOOK_APP_SECRET'),
    Deno.env.get('META_APP_SECRET_2'),
  ].filter((s): s is string => !!s);
  for (const s of secrets) {
    if (await verifyMetaSignature(body, signature, s)) return true;
  }
  return false;
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

/**
 * Lookup determinístico de assignment por telefone (todas as variantes + sufixo 8).
 *
 * NUNCA usar .maybeSingle() aqui: com linhas duplicadas o PostgREST devolve ERRO,
 * o chamador enxergava "não existe" e criava uma linha nova — foi essa a causa raiz
 * de conversas duplicadas/reatribuídas. Aqui um erro de leitura é PROPAGADO
 * (AssignmentLookupError) para o chamador ABORTAR em vez de duplicar.
 */
class AssignmentLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentLookupError';
  }
}

function buildAssignmentPhoneFilter(phone: string): { normalized: string; filter: string } {
  const normalized = normalizePhone(phone);
  const exact = getPhoneVariants(normalized).map((v) => `conversation_phone.eq.${v}`);
  const suffix8 = normalized.slice(-8);
  const fallback = suffix8 ? [`conversation_phone.ilike.%${suffix8}`] : [];
  return { normalized, filter: [...exact, ...fallback].join(',') };
}

/** Escolhe determinísticamente: com dono > sem dono; in_progress > outros; mais recente. */
function pickAssignmentRow<T extends Record<string, any>>(rows: T[]): T | null {
  return [...(rows || [])].sort((a, b) => {
    if (!!a.assigned_to !== !!b.assigned_to) return a.assigned_to ? -1 : 1;
    const aActive = a.status === 'in_progress' ? 1 : 0;
    const bActive = b.status === 'in_progress' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  })[0] || null;
}

async function findAssignmentByPhone(
  // deno-lint-ignore no-explicit-any
  db: any,
  channelId: string,
  phone: string,
  select = 'id, organization_id, assigned_to, status, sector_id, is_bot_handling, lead_id, conversation_phone, updated_at, created_at'
): Promise<Record<string, any> | null> {
  const { filter } = buildAssignmentPhoneFilter(phone);
  if (!filter) return null;
  const { data, error } = await db
    .from('conversation_assignments')
    .select(select)
    .eq('channel_id', channelId)
    .or(filter)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw new AssignmentLookupError(error.message);
  return pickAssignmentRow(data || []);
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
  autoBlacklistEnabled: boolean;
  declineMessageEnabled: boolean;
  chatbotConfigs: Map<string, unknown>;
}> {
  return getCached(`org_config:${organizationId}`, async () => {
    // Fetch all org config in parallel — ONE round trip per org per 30s
    const [bhRes, holidaysRes, awayRes, welcomeRes, orgRes] = await Promise.all([
      supabase.from('business_hours').select('day_of_week, is_active, start_time, end_time').eq('organization_id', organizationId),
      supabase.from('holidays').select('date, is_recurring').eq('organization_id', organizationId),
      supabase.from('away_message_config').select('message, is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('welcome_message_config').select('message, is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('organizations').select('auto_blacklist_enabled, decline_message_enabled').eq('id', organizationId).maybeSingle(),
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
      autoBlacklistEnabled: orgRes.data?.auto_blacklist_enabled !== false,
      declineMessageEnabled: orgRes.data?.decline_message_enabled !== false,
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
// BSUID (Business-Scoped User ID) HELPERS
// =============================================
/** Extract the BSUID from an inbound Meta message payload (new field, may be absent). */
function extractBsuid(msg: Record<string, unknown>): string | null {
  const v = (msg.from_user_id ?? msg.user_id) as string | undefined;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Find an existing lead by BSUID (used when the webhook omits the phone number). */
async function findLeadByBsuid(
  organizationId: string, bsuid: string
): Promise<{ id: string; phone: string | null; name: string | null } | null> {
  const { data } = await supabase
    .from('leads')
    .select('id, phone, name')
    .eq('organization_id', organizationId)
    .eq('bsuid', bsuid)
    .maybeSingle();
  return data ?? null;
}

// =============================================
// FIND OR CREATE LEAD (parallel exact+suffix)
// =============================================
async function findOrCreateLead(
  organizationId: string, userId: string, phone: string, name: string | null, bsuid: string | null = null
): Promise<{ leadId: string; isNew: boolean }> {
  // ── BSUID-only contact (Meta username adopted, phone absent) ──
  if (!phone || !phone.replace(/\D/g, '')) {
    if (!bsuid) return { leadId: '', isNew: false };
    const existing = await findLeadByBsuid(organizationId, bsuid);
    if (existing) return { leadId: existing.id, isNew: false };

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert({
        organization_id: organizationId, user_id: userId, phone: null, bsuid,
        name: name || 'Contato sem telefone (BSUID)', status: 'new',
      })
      .select('id')
      .single();

    if (createErr || !created) {
      const fallback = await findLeadByBsuid(organizationId, bsuid);
      return { leadId: fallback?.id || '', isNew: false };
    }
    return { leadId: created.id, isNew: true };
  }

  const normalized = normalizePhone(phone);
  const suffix8 = normalized.slice(-8);

  // Parallel: exact + suffix + bsuid in one round-trip
  const [exactRes, suffixRes, bsuidRes] = await Promise.all([
    supabase.from('leads').select('id').eq('organization_id', organizationId).eq('phone', normalized).limit(1),
    supabase.from('leads').select('id').eq('organization_id', organizationId).ilike('phone', `%${suffix8}`).limit(1),
    bsuid
      ? supabase.from('leads').select('id').eq('organization_id', organizationId).eq('bsuid', bsuid).limit(1)
      : Promise.resolve({ data: null }),
  ]);

  const found = exactRes.data?.[0]?.id || suffixRes.data?.[0]?.id || (bsuidRes as { data: { id: string }[] | null }).data?.[0]?.id;
  if (found) {
    // Keep BSUID / phone in sync on the known lead (best effort)
    if (bsuid) {
      supabase.from('leads').update({ bsuid, phone: normalized }).eq('id', found).then(() => {}, () => {});
    }
    return { leadId: found, isNew: false };
  }

  const leadName = name || `LeadWhats-${normalized.slice(-4)}`;
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({ organization_id: organizationId, user_id: userId, phone: normalized, name: leadName, status: 'new', bsuid })
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

/**
 * Meta `system` webhook: `user_changed_user_id` — the end user changed phone number
 * but keeps the same BSUID. Update the existing lead's phone instead of creating a new one.
 */
async function processSystemUserChange(msg: Record<string, unknown>, channel: Record<string, unknown>) {
  const organizationId = channel.organization_id as string;
  const system = (msg.system || {}) as Record<string, unknown>;
  const bsuid = extractBsuid(msg) || (system.user_id as string) || null;
  const newPhoneRaw = (system.wa_id as string) || (system.new_wa_id as string) || (msg.from as string) || '';
  if (!bsuid) {
    console.warn('[system:user_changed_user_id] no BSUID in payload, skipping');
    return;
  }
  const lead = await findLeadByBsuid(organizationId, bsuid);
  if (!lead) {
    console.log('[system:user_changed_user_id] no lead for BSUID', bsuid, '- nothing to migrate');
    return;
  }
  const newPhone = newPhoneRaw ? normalizePhone(newPhoneRaw) : null;
  if (!newPhone) {
    console.warn('[system:user_changed_user_id] no new phone in payload for BSUID', bsuid);
    return;
  }
  await supabase.from('leads').update({ phone: newPhone, updated_at: new Date().toISOString() }).eq('id', lead.id);
  console.log(`[system:user_changed_user_id] lead ${lead.id} phone updated ${lead.phone} -> ${newPhone}`);
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

  // Prefer attendants explicitly online (is_available=true).
  const { data: onlineAttendants } = await supabase
    .from('attendant_availability')
    .select('user_id, last_assignment_at')
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .in('user_id', userIds)
    .order('last_assignment_at', { ascending: true, nullsFirst: true });

  let availableAttendants = onlineAttendants;

  // Fallback: no one online in the sector — still distribute inside the sector
  // (never send the conversation back to the "Novos" queue).
  if (!availableAttendants || availableAttendants.length === 0) {
    const { data: anyAttendants } = await supabase
      .from('attendant_availability')
      .select('user_id, last_assignment_at')
      .eq('organization_id', organizationId)
      .in('user_id', userIds)
      .order('last_assignment_at', { ascending: true, nullsFirst: true });
    availableAttendants = anyAttendants;
  }

  // Last resort: sector members without an availability row yet.
  if (!availableAttendants || availableAttendants.length === 0) {
    availableAttendants = userIds.map((id: string) => ({ user_id: id, last_assignment_at: null }));
  }

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
// DEFAULT SECTOR (per-organization auto distribution)
// Returns the org's default sector when the feature is enabled, else null.
// =============================================
async function getOrgDefaultSector(organizationId: string): Promise<string | null> {
  return await getCached(`orgdefsector:${organizationId}`, async () => {
    const { data } = await supabase
      .from('organizations')
      .select('auto_distribute_enabled, default_sector_id')
      .eq('id', organizationId)
      .maybeSingle();
    if (data?.auto_distribute_enabled && data?.default_sector_id) return data.default_sector_id as string;
    return null;
  });
}


// =============================================
// CONVERSATION ASSIGNMENT (optimized upsert with round-robin)
// =============================================
async function handleConversationAssignment(
  channelId: string, leadId: string, normalizedPhone: string, organizationId: string, isFromAd: boolean = false
): Promise<{ assignmentId: string; assignedTo: string | null; status: string; sectorId: string | null; isBotHandling: boolean }> {
  const phoneVariants = getPhoneVariants(normalizedPhone);

  // CUTOVER: read/write conversation_assignments DIRECTLY on external (SSoT)
  const caDb = externalSupabase;

  // Busca única por TODAS as variantes + sufixo 8, com escolha determinística.
  // Erro de leitura NUNCA é tratado como "não existe" — abortamos, senão criaríamos
  // uma conversa duplicada e o atendimento sumiria do dono atual.
  let existing: Record<string, any> | null = null;
  try {
    existing = await findAssignmentByPhone(caDb, channelId, normalizedPhone);
  } catch (e) {
    console.error(`[handleConversationAssignment] Lookup falhou para ${normalizedPhone} — abortando (sem criar duplicata):`, (e as Error).message);
    return { assignmentId: '', assignedTo: null, status: 'pending', sectorId: null, isBotHandling: false };
  }
  if (existing && existing.conversation_phone !== normalizedPhone) {
    console.log(`[handleConversationAssignment] Found variant match: ${normalizedPhone} → ${existing.conversation_phone} (assignment: ${existing.id})`);
  }

  if (existing) {
    // Grace period: don't reactivate conversations archived less than 5 minutes ago.
    // EXCEÇÃO: assignments criados por campanha (assigned_to=null, status=archived e
    // updated_at == created_at) nunca foram "arquivados por atendente" — são apenas
    // placeholders do disparo. Resposta do lead (ex.: clique em "CONSULTAR AGORA")
    // DEVE reativar imediatamente, senão nunca aparecem em "Novos".
    const isCampaignPlaceholder =
      existing.status === 'archived' &&
      !existing.assigned_to &&
      existing.updated_at &&
      // updated_at igual (ou ~igual) ao created_at indica que nunca foi tocado
      // após a criação pela campanha.
      Math.abs(new Date(existing.updated_at).getTime() - new Date((existing as any).created_at || existing.updated_at).getTime()) < 2000;

    const wasRecentlyArchived = existing.status === 'archived' && existing.updated_at &&
      (Date.now() - new Date(existing.updated_at).getTime()) < 5 * 60 * 1000 &&
      !isCampaignPlaceholder;

    if (wasRecentlyArchived) {
      console.log(`[handleConversationAssignment] Skipping reactivation for recently archived conversation: ${normalizedPhone} (archived ${Math.round((Date.now() - new Date(existing.updated_at!).getTime()) / 1000)}s ago, assigned_to=${existing.assigned_to})`);
      return { assignmentId: existing.id, assignedTo: existing.assigned_to, status: existing.status, sectorId: existing.sector_id, isBotHandling: existing.is_bot_handling || false };
    }

    // Trigger update when: archived, missing lead, OR unassigned (e.g. campaign-created assignments)
    const needsUpdate = existing.status === 'archived' || !existing.lead_id || !existing.assigned_to || !existing.organization_id;
    if (needsUpdate) {
      let assignedTo = existing.assigned_to;
      let newStatus = existing.status === 'archived'
        ? (assignedTo ? 'in_progress' : 'pending')
        : existing.status;

      // Default sector (per-org auto distribution): conversation without sector
      // goes to the organization's default department instead of the "Novos" queue.
      let effectiveSectorId = existing.sector_id;
      if (!effectiveSectorId) {
        effectiveSectorId = await getOrgDefaultSector(organizationId);
        if (effectiveSectorId) {
          console.log(`[handleConversationAssignment] Default sector applied to ${normalizedPhone} → ${effectiveSectorId}`);
        }
      }

      if (!assignedTo && effectiveSectorId) {
        const attendant = await getNextAvailableAttendant(organizationId, effectiveSectorId);
        if (attendant) {
          assignedTo = attendant.userId;
          newStatus = 'in_progress';
          console.log(`[handleConversationAssignment] Round-robin assigned ${normalizedPhone} → ${assignedTo} (sector: ${effectiveSectorId})`);
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
        .update({ organization_id: organizationId, status: newStatus, lead_id: leadId, assigned_to: assignedTo, sector_id: effectiveSectorId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      console.log(`[handleConversationAssignment] Updated conversation for ${normalizedPhone} → status=${newStatus}, assigned=${assignedTo} (sector: ${effectiveSectorId})`);
      return { assignmentId: existing.id, assignedTo, status: newStatus, sectorId: effectiveSectorId, isBotHandling: existing.is_bot_handling || false };

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

  // Fallback: organization default department (auto distribution enabled)
  if (!sectorId) {
    sectorId = await getOrgDefaultSector(organizationId);
    if (sectorId) {
      console.log(`[handleConversationAssignment] New conv default sector: ${normalizedPhone} → ${sectorId}`);
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
    // Corrida (ou índice único barrando duplicata): reler por variantes/sufixo.
    let fallback: Record<string, any> | null = null;
    try {
      fallback = await findAssignmentByPhone(caDb, channelId, normalizedPhone);
    } catch (e) {
      console.error('[handleConversationAssignment] Fallback lookup falhou:', (e as Error).message);
    }
    if (!fallback) {
      console.error('[handleConversationAssignment] Insert falhou e nada encontrado na releitura:', error?.message);
    }
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
  const organizationId = channel.organization_id as string;
  const bsuid = extractBsuid(msg);

  // ── Meta BSUID: `from` may be ABSENT when the user adopted a username ──
  // Resolve the phone from a previously known lead with the same BSUID.
  let senderPhone = (msg.from as string) || '';
  let bsuidOnlyLead: { id: string; phone: string | null; name: string | null } | null = null;
  if (!senderPhone.replace(/\D/g, '') && bsuid) {
    bsuidOnlyLead = await findLeadByBsuid(organizationId, bsuid);
    if (bsuidOnlyLead?.phone) {
      senderPhone = bsuidOnlyLead.phone;
      console.log('[processMessage] BSUID matched known lead, using phone', senderPhone);
    } else {
      console.log('[processMessage] Inbound with BSUID only (no phone):', bsuid);
    }
  }
  const hasPhone = !!senderPhone.replace(/\D/g, '');
  if (!hasPhone && !bsuid) {
    console.warn('[processMessage] Message without phone and without BSUID, skipping:', messageId);
    return;
  }

  const timestamp = msg.timestamp;
  const messageType = msg.type as string;
  // Conversation key: phone when known, otherwise the BSUID (stable identifier).
  const normalizedPhone = hasPhone ? normalizePhone(senderPhone) : (bsuid as string);

  if (hasPhone && await isPhoneBlacklisted(organizationId, normalizedPhone)) {
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

  // Intent classification: block > negative > other.
  const leadIntent = classifyLeadIntent(content, messageType);

  // Direct sender bound to this channel (avoids fragile functions.invoke hops)
  const sendDirect = async (to: string, body: string): Promise<boolean> => {
    if (!channel.access_token || !channel.app_name) return false;
    // Never attempt to send to a BSUID — Meta's Messages API requires a phone number.
    if (!to || !to.replace(/\D/g, '')) return false;
    const ok = await sendWhatsAppMessage(
      channel.app_name as string,
      channel.access_token as string,
      to,
      body,
    );
    if (ok) {
      await dualWriteMessage({
        channel_id: channel.id as string,
        message_id: `auto_${to}_${Date.now()}`,
        sender_phone: channel.phone,
        sender_name: 'Sistema',
        message_type: 'text',
        content: body,
        direction: 'outbound',
        status: 'sent',
        organization_id: organizationId,
        metadata: { provider: 'meta', auto_reply: true, destination: to },
      }, false, channel.id as string).catch(() => {});
    }
    return ok;
  };

  // Auto-blacklist: if the lead asks to be blocked, add to blacklist (atendente can unblock).
  // Requires a phone (blacklist is phone-based) — BSUID-only contacts are skipped.
  const wasBlocked = leadIntent === 'block' && orgConfig.autoBlacklistEnabled && hasPhone
    ? await maybeAutoBlacklist(
        supabase, organizationId, normalizedPhone, content, messageType, contactName,
        { id: channel.id as string, provider: 'meta' }, sendDirect,
      )
    : false;


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
      const { leadId } = bsuidOnlyLead && !hasPhone
        ? { leadId: bsuidOnlyLead.id }
        : await findOrCreateLead(organizationId, channel.user_id as string, senderPhone, contactName, bsuid);
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
      timestamp, provider: 'meta', original_phone: senderPhone || null, bsuid: bsuid || null, lead_id: leadData?.leadId || null,
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

    // Auto-finalizar: lead clicou em "Não Quero" / "Não Quero Consultar".
    // Vale para TODAS as organizações (sem opt-in). Usa o mesmo status da
    // finalização manual do atendente ('archived').
    if (isNotWantedLabel(buttonText)) {
      const assignmentId = leadData?.assignment?.assignmentId;
      if (assignmentId && externalSupabase) {
        runInBackground((async () => {
          const { error: naoQueroErr } = await externalSupabase
            .from('conversation_assignments')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('id', assignmentId);
          if (naoQueroErr) {
            console.error('[Webhook] Falha ao finalizar por "Não Quero":', naoQueroErr);
          } else {
            console.log(`[Webhook] ✅ Conversa finalizada automaticamente (Não Quero): ${normalizedPhone}`);
          }
        })());
      }
    }
    
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
  if (awayMessageToSend && channel.access_token && hasPhone) {
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

  // Lead asked to be blocked → goodbye already sent by auto-blacklist. Stop here.
  if (wasBlocked) {
    markWelcomeSent(organizationId, normalizedPhone).catch(() => {});
    return;
  }

  // Lead declined the offer → polite closing message, no welcome, no chatbot.
  if (leadIntent === 'negative' && orgConfig.declineMessageEnabled && hasPhone) {
    // SOMENTE no primeiro contato do lead. Se já houver histórico, nunca enviar.
    const firstContact = await isFirstInboundContact(messageDb, normalizedPhone, messageId);
    if (!firstContact) {
      console.log('[decline] Ignorado: lead já possui histórico de conversa:', normalizedPhone);
    } else {
      sendDirect(normalizedPhone, DECLINE_MESSAGE).catch(console.error);
      markWelcomeSent(organizationId, normalizedPhone).catch(() => {});
      return;
    }
  }

  // Resposta negativa/pedido de bloqueio NUNCA recebe boas-vindas,
  // mesmo que a mensagem de negativa esteja desativada ou já haja histórico.
  if (leadIntent !== 'other') {
    markWelcomeSent(organizationId, normalizedPhone).catch(() => {});
    if (chatbotConfig) {
      invokeChatbot(channel, chatbotConfig as Record<string, unknown>, normalizedPhone, contactName, content, messageId);
    }
    return;
  }

  // Welcome message (not blocked, not sent before) — only for positive/neutral replies
  if (businessStatus.isOpen && orgConfig.welcomeEnabled && orgConfig.welcomeMessage && !welcomeAlreadySent && channel.access_token && hasPhone) {
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
      } else {
        console.warn('[welcome] Send failed for', normalizedPhone);
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

    // Signature verification.
    // IMPORTANT: META_APP_SECRET belongs to the Embedded Signup app (1095955566297881),
    // NOT to the app that delivers these webhooks — using it here rejected every event.
    // Only a secret explicitly registered for the webhook app is used.
    const webhookSecrets = [
      Deno.env.get('META_WEBHOOK_APP_SECRET'),
      Deno.env.get('META_APP_SECRET_2'),
    ].filter((s): s is string => !!s);

    let signatureOk = false;
    if (webhookSecrets.length > 0) {
      const signature = req.headers.get('x-hub-signature-256');
      for (const s of webhookSecrets) {
        if (await verifyMetaSignature(bodyText, signature, s)) { signatureOk = true; break; }
      }
    }

    if (!signatureOk) {
      // Minimal authenticity gate: payload must reference a WABA/phone number we own.
      let known = false;
      try {
        const parsed = JSON.parse(bodyText);
        const entryId = parsed?.entry?.[0]?.id;
        const pnId = parsed?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        if (entryId) {
          const { data } = await supabase.from('channels').select('id').eq('waba_id', String(entryId)).limit(1);
          known = !!data?.length;
        }
        if (!known && pnId) {
          const { data } = await supabase.from('channels').select('id').eq('app_name', String(pnId)).limit(1);
          known = !!data?.length;
        }
      } catch { /* ignore */ }
      if (!known && webhookSecrets.length > 0) {
        console.error('[Webhook] REJECTED: invalid signature and unknown WABA/phone from', req.headers.get('x-forwarded-for') || 'unknown');
        return new Response('Unauthorized', { status: 401 });
      }
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
            // Contact names are indexed by wa_id (phone) AND by user_id (BSUID),
            // since Meta may omit wa_id when the user adopted a username.
            const contactsMap = new Map<string, string>();
            if (value.contacts) {
              for (const c of value.contacts) {
                const name = c.profile?.name;
                if (!name) continue;
                if (c.wa_id) contactsMap.set(c.wa_id, name);
                if (c.user_id) contactsMap.set(c.user_id, name);
              }
            }
            messagePromise = Promise.all(value.messages.map((msg: Record<string, unknown>) => {
              const name = contactsMap.get(msg.from as string)
                || contactsMap.get(extractBsuid(msg) || '')
                || null;
              // Meta `system` events: phone number change keeps the same BSUID.
              const sys = msg.system as Record<string, unknown> | undefined;
              if (msg.type === 'system' && sys?.type === 'user_changed_user_id') {
                return processSystemUserChange(msg, channel as Record<string, unknown>);
              }
              return processMessage(msg, channel as Record<string, unknown>, name);
            }));
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
