/**
 * External Database Client
 *
 * Reads whatsapp_messages and leads directly from the external Supabase
 * using a short-lived JWT (via external-auth-token). This replaces the
 * old external-db-proxy edge function, eliminating per-request Cloud
 * compute costs.
 */
import { supabase } from "@/integrations/supabase/client";
import { getExternalClient } from "@/lib/externalSupabaseClient";
import { getPhoneLookupVariants } from "@/lib/phoneThreadKey";

const HISTORY_SCAN_BATCH_SIZE = 150;
const HISTORY_SCAN_MAX_BATCHES = 8;

// ── Circuit breaker for direct external reads ─────────────────────
// If RLS isn't configured on the external DB (or JWT secret mismatch),
// every direct read fails with "permission denied" and we waste 200-500ms
// per conversation switch before falling back to the proxy. Once we see
// that error, skip direct reads for the rest of the session.
let directReadDisabledUntil = 0;
const DIRECT_READ_COOLDOWN_MS = 5 * 60_000; // 5 minutes

function isPermissionError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("permission denied") || m.includes("rls") || m.includes("jwt");
}

function disableDirectRead(reason: string): void {
  if (Date.now() < directReadDisabledUntil) return;
  directReadDisabledUntil = Date.now() + DIRECT_READ_COOLDOWN_MS;
  console.warn(
    `[externalDb] Direct external reads DISABLED for ${DIRECT_READ_COOLDOWN_MS / 1000}s — falling back to proxy. Reason: ${reason}`
  );
}

function isDirectReadDisabled(): boolean {
  return Date.now() < directReadDisabledUntil;
}

/**
 * Force re-enable direct external reads (clears the circuit breaker).
 * Call this when the user manually retries or when we suspect the breaker
 * is stale (e.g. RLS was just fixed on the external DB).
 */
export function resetDirectReadCircuit(): void {
  if (directReadDisabledUntil > 0) {
    console.info("[externalDb] Direct read circuit breaker manually reset.");
  }
  directReadDisabledUntil = 0;
}

// ── Types ─────────────────────────────────────────────────────────

export interface ExternalMessagePage {
  messages: ExternalMessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ExternalMessageRow {
  id: string;
  channel_id: string | null;
  organization_id?: string | null;
  message_id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  direction: string;
  status: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  error_message?: string | null;
  is_read?: boolean;
}

interface ConversationStatsFallbackRow {
  conversation_phone: string;
  last_message_content: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  sender_name: string | null;
}

export interface BulkPreviewResult {
  channelId: string;
  phone: string;
  content: string | null;
  messageType: string | null;
  direction: string | null;
  createdAt: string | null;
  senderName: string | null;
  lastInboundAt: string | null;
}

// ── Phone matching helpers ────────────────────────────────────────

interface PhoneLookup {
  exact: Set<string>;
  suffixes: Set<string>;
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function buildPhoneLookup(phoneVariants: string[]): PhoneLookup {
  const exact = new Set(phoneVariants.map(normalizePhone).filter(Boolean));
  const suffixes = new Set<string>();
  exact.forEach((phone) => {
    if (phone.length >= 9) suffixes.add(phone.slice(-9));
    if (phone.length >= 8) suffixes.add(phone.slice(-8));
  });
  return { exact, suffixes };
}

function phoneMatchesLookup(candidate: unknown, lookup: PhoneLookup): boolean {
  const normalized = normalizePhone(candidate);
  if (!normalized) return false;
  if (lookup.exact.has(normalized)) return true;
  for (const suffix of lookup.suffixes) {
    if (normalized.endsWith(suffix)) return true;
  }
  return false;
}

function messageMatchesConversation(
  message: ExternalMessageRow,
  direction: "inbound" | "outbound",
  lookup: PhoneLookup,
  channelPhoneLookup?: PhoneLookup | null
): boolean {
  if (direction === "inbound") {
    if (!phoneMatchesLookup(message.sender_phone, lookup)) return false;
    // Filter by channel phone if available (stored in metadata.channel_phone)
    if (channelPhoneLookup) {
      const meta = (message.metadata ?? {}) as Record<string, unknown>;
      const msgChannelPhone = meta.channel_phone;
      // If the message has channel_phone metadata, filter by it
      if (msgChannelPhone) {
        return phoneMatchesLookup(msgChannelPhone, channelPhoneLookup);
      }
      // Legacy messages without channel_phone: include them (can't distinguish)
    }
    return true;
  }
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const destinationMatch = [meta.destination, meta.to, meta.phone, meta.contact_phone, meta.contactPhone, meta.recipient_phone, meta.recipientPhone]
    .some((c) => phoneMatchesLookup(c, lookup));
  if (!destinationMatch) return false;
  // Filter outbound by sender_phone matching channel phone
  if (channelPhoneLookup) {
    return phoneMatchesLookup(message.sender_phone, channelPhoneLookup);
  }
  return true;
}

// ── Direct external DB fetch ──────────────────────────────────────

const SELECT_FIELDS =
  "id, channel_id, organization_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

const OUTBOUND_PHONE_METADATA_FIELDS = [
  "destination",
  "to",
  "phone",
  "contact_phone",
  "contactPhone",
  "recipient_phone",
  "recipientPhone",
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function invokeExternalProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("external-db-proxy", {
    body,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}

async function fetchDirectionMessages(
  channelId: string,
  direction: "inbound" | "outbound",
  cursorFilter: string,
  pageSize: number,
  lookup: PhoneLookup,
  impersonatedOrgId?: string | null,
  channelPhoneLookup?: PhoneLookup | null,
  lowerBoundCreatedAt?: string | null
): Promise<ExternalMessageRow[]> {
  const ext = await getExternalClient(impersonatedOrgId);

  const phoneVariantsForFilter = Array.from(lookup.exact);
  const channelIdParts = phoneVariantsForFilter.map((phone) => `channel_id.eq.${phone}`);
  channelIdParts.push(`channel_id.eq.${channelId}`);
  const channelIdFilter = channelIdParts.join(",");

  let scanCursor = cursorFilter;
  const matched: ExternalMessageRow[] = [];
  const seen = new Set<string>();

  for (let batch = 0; batch < HISTORY_SCAN_MAX_BATCHES; batch++) {
    let query = ext
      .from("whatsapp_messages")
      .select(SELECT_FIELDS)
      .or(channelIdFilter)
      .eq("direction", direction)
      .lt("created_at", scanCursor);

    // CIRURGIA: limite inferior fecha a janela e força o índice
    // (channel_id, created_at) a fazer um range scan apertado em vez
    // de varrer milhares de linhas pra trás.
    if (lowerBoundCreatedAt) {
      query = query.gte("created_at", lowerBoundCreatedAt);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(HISTORY_SCAN_BATCH_SIZE);

    if (error) {
      console.warn(`[externalDb] Direct ${direction} fetch failed:`, error.message);
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ExternalMessageRow[];
    if (rows.length === 0) break;

    rows.forEach((row) => {
      if (!seen.has(row.id) && messageMatchesConversation(row, direction, lookup, channelPhoneLookup)) {
        seen.add(row.id);
        matched.push(row);
      }
    });

    if (matched.length >= pageSize || rows.length < HISTORY_SCAN_BATCH_SIZE) break;

    const nextCursor = rows[rows.length - 1]?.created_at;
    if (!nextCursor || nextCursor === scanCursor) break;
    scanCursor = nextCursor;
  }

  return matched;
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchExternalMessages(params: {
  channelId: string;
  phoneVariants: string[];
  cursor: string | null;
  pageSize?: number;
  impersonatedOrgId?: string | null;
  channelPhone?: string | null;
  /** Optional lower-bound timestamp (ISO). When provided, the scan is
   *  limited to created_at >= lowerBoundCreatedAt. Used by the campaign
   *  report preview to make the lookup surgical (typically sent_at - 1 day). */
  lowerBoundCreatedAt?: string | null;
}): Promise<ExternalMessagePage> {
  const pageSize = params.pageSize ?? 25;

  // Build channel phone lookup for filtering messages by specific channel
  const channelPhoneLookup = params.channelPhone
    ? buildPhoneLookup([params.channelPhone])
    : null;

  const cursorFilter = params.cursor ?? new Date(Date.now() + 120_000).toISOString();
  const lookup = buildPhoneLookup(params.phoneVariants);

  // PERFORMANCE: prefer direct external read (proxy is deprecated and adds
  // 200-500ms of cold-start + extra hop on every conversation switch).
  // If a previous call hit "permission denied" (RLS not configured on the
  // external DB), skip direct reads entirely until the cooldown elapses.
  if (!isDirectReadDisabled()) {
    try {
      const [inbound, outbound] = await Promise.all([
        fetchDirectionMessages(
          params.channelId,
          "inbound",
          cursorFilter,
          pageSize,
          lookup,
          params.impersonatedOrgId,
          channelPhoneLookup,
          params.lowerBoundCreatedAt
        ),
        fetchDirectionMessages(
          params.channelId,
          "outbound",
          cursorFilter,
          pageSize,
          lookup,
          params.impersonatedOrgId,
          channelPhoneLookup,
          params.lowerBoundCreatedAt
        ),
      ]);

      const merged = [...inbound, ...outbound].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const seen = new Set<string>();
      const unique = merged.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      const page = unique.slice(0, pageSize);
      const hasMore = unique.length >= pageSize;
      const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

      return { messages: page, nextCursor, hasMore };
    } catch (directError) {
      const msg = getErrorMessage(directError);
      if (isPermissionError(msg)) {
        disableDirectRead(msg);
      } else {
        console.warn("[externalDb] Direct read failed, trying proxy fallback:", msg);
      }
    }
  }

  // Last-resort fallback to legacy proxy edge function
  try {
    const proxyResult = await invokeExternalProxy<ExternalMessagePage>({
      action: "messages",
      channelId: params.channelId,
      phoneVariants: params.phoneVariants,
      cursor: params.cursor,
      pageSize,
      impersonatedOrgId: params.impersonatedOrgId,
    });
    if (channelPhoneLookup && proxyResult.messages.length > 0) {
      proxyResult.messages = proxyResult.messages.filter((msg) => {
        const dir = msg.direction as "inbound" | "outbound";
        return messageMatchesConversation(msg, dir, lookup, channelPhoneLookup);
      });
    }
    return proxyResult;
  } catch (proxyError) {
    console.error("[externalDb] Proxy fallback also failed:", getErrorMessage(proxyError));
  }

  if (!params.cursor) {
    try {
      return await fetchConversationStatsMessages({
        channelId: params.channelId,
        phoneVariants: params.phoneVariants,
      });
    } catch (statsError) {
      console.warn("[externalDb] Conversation stats fallback failed:", getErrorMessage(statsError));
    }
  }

  return { messages: [], nextCursor: null, hasMore: false };
}

export async function fetchExternalMessagesForLead(params: {
  phone: string;
  organizationId: string;
  channelIds?: string[];
  limit?: number;
  impersonatedOrgId?: string | null;
}): Promise<ExternalMessageRow[]> {
  const limit = params.limit ?? 100;
  const phoneVariants = getPhoneLookupVariants(params.phone);
  const lookup = buildPhoneLookup(phoneVariants);
  const suffixes = Array.from(lookup.suffixes).sort((a, b) => b.length - a.length);
  if (suffixes.length === 0) return [];
  const channelIds = (params.channelIds ?? []).filter(Boolean);

  const filterAndSort = (rows: ExternalMessageRow[]) => {
    const seen = new Set<string>();
    return rows
      .filter((message) => {
        if (seen.has(message.id)) return false;
        const direction = message.direction === "outbound" ? "outbound" : "inbound";
        if (!messageMatchesConversation(message, direction, lookup)) return false;
        seen.add(message.id);
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  };

  const fetchViaProxy = async () => {
    const data = await invokeExternalProxy<{ messages: ExternalMessageRow[] }>({
      action: "lead_messages",
      phoneVariants,
      channelIds,
      limit,
      impersonatedOrgId: params.impersonatedOrgId,
    });
    return filterAndSort(data.messages ?? []);
  };

  if (isDirectReadDisabled()) {
    return fetchViaProxy();
  }

  try {
    const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
    const selectFields = SELECT_FIELDS;
    const inboundOr = suffixes.map((suffix) => `sender_phone.like.%${suffix}`).join(",");
    const outboundOr = suffixes
      .flatMap((suffix) => OUTBOUND_PHONE_METADATA_FIELDS.map((field) => `metadata->>${field}.like.%${suffix}`))
      .join(",");

    const buildBaseQuery = (direction: "inbound" | "outbound") => {
      let query = ext
        .from("whatsapp_messages")
        .select(selectFields)
        .eq("organization_id", params.organizationId)
        .eq("direction", direction);

      if (channelIds.length > 0) {
        query = query.in("channel_id", channelIds);
      }

      return query;
    };

    const [inboundResult, outboundResult] = await Promise.all([
      buildBaseQuery("inbound")
        .or(inboundOr)
        .order("created_at", { ascending: false })
        .limit(limit),
      buildBaseQuery("outbound")
        .or(outboundOr)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (inboundResult.error) throw new Error(inboundResult.error.message);
    if (outboundResult.error) throw new Error(outboundResult.error.message);

    let combined = ([...(inboundResult.data ?? []), ...(outboundResult.data ?? [])] as ExternalMessageRow[]);

    // Legacy campaign/webhook rows may have channel_id saved as the contact phone
    // instead of the WhatsApp channel UUID. If channel filtering hides everything,
    // retry organization-wide by phone so existing history is never shown as empty.
    if (combined.length === 0 && channelIds.length > 0) {
      const [wideInboundResult, wideOutboundResult] = await Promise.all([
        ext
          .from("whatsapp_messages")
          .select(selectFields)
          .eq("organization_id", params.organizationId)
          .eq("direction", "inbound")
          .or(inboundOr)
          .order("created_at", { ascending: false })
          .limit(limit),
        ext
          .from("whatsapp_messages")
          .select(selectFields)
          .eq("organization_id", params.organizationId)
          .eq("direction", "outbound")
          .or(outboundOr)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      if (wideInboundResult.error) throw new Error(wideInboundResult.error.message);
      if (wideOutboundResult.error) throw new Error(wideOutboundResult.error.message);
      combined = ([...(wideInboundResult.data ?? []), ...(wideOutboundResult.data ?? [])] as ExternalMessageRow[]);
    }

    return filterAndSort(combined);
  } catch (directError) {
    const msg = getErrorMessage(directError);
    if (isPermissionError(msg)) disableDirectRead(msg);
    console.warn("[externalDb] Lead history direct read failed, using proxy fallback:", msg);
    try {
      return await fetchViaProxy();
    } catch (proxyError) {
      console.error("[externalDb] Lead history proxy fallback failed:", getErrorMessage(proxyError));
      return [];
    }
  }
}

// ── Conversation stats fallback (reads from INTERNAL DB) ──────────

function getSyntheticMessageDirection(row: ConversationStatsFallbackRow): "inbound" | "outbound" {
  if (!row.last_inbound_at) return "outbound";
  if (!row.last_message_at) return "inbound";
  return new Date(row.last_inbound_at).getTime() >= new Date(row.last_message_at).getTime()
    ? "inbound" : "outbound";
}

function buildSyntheticMessageFromStats(
  channelId: string,
  row: ConversationStatsFallbackRow
): ExternalMessageRow | null {
  const createdAt = row.last_message_at ?? row.last_inbound_at;
  if (!createdAt) return null;

  const direction = getSyntheticMessageDirection(row);
  const content = row.last_message_content?.trim() || "";
  if (!content) return null;

  return {
    id: `stats_${channelId}_${row.conversation_phone}_${createdAt}`,
    channel_id: channelId,
    organization_id: null,
    message_id: `stats_${channelId}_${row.conversation_phone}_${createdAt}`,
    sender_phone: row.conversation_phone,
    sender_name: row.sender_name,
    message_type: content.startsWith("Template:") ? "template" : "text",
    content,
    media_url: null,
    direction,
    status: direction === "inbound" ? "received" : "sent",
    created_at: createdAt,
    metadata:
      direction === "outbound"
        ? { destination: row.conversation_phone, synthetic: true, source: "conversation_stats" }
        : { synthetic: true, source: "conversation_stats" },
    error_message: null,
    is_read: direction === "outbound" || (row.unread_count ?? 0) === 0,
  };
}

export async function fetchConversationStatsMessages(params: {
  channelId: string;
  phoneVariants: string[];
}): Promise<ExternalMessagePage> {
  const statsPhoneVariants = Array.from(
    new Set(params.phoneVariants.map((phone) => phone.replace(/\D/g, "")).filter(Boolean))
  );
  if (statsPhoneVariants.length === 0) {
    return { messages: [], nextCursor: null, hasMore: false };
  }

  const statsPhoneFilter = statsPhoneVariants
    .map((phone) => `conversation_phone.eq.${phone}`)
    .join(",");

  const { data, error } = await supabase
    .from("conversation_stats")
    .select("conversation_phone, last_message_content, last_message_at, last_inbound_at, unread_count, sender_name")
    .filter("channel_id", "eq", String(params.channelId))
    .or(statsPhoneFilter)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(3);

  if (error) {
    throw new Error(`Conversation stats fallback error: ${error.message}`);
  }

  const message = (data ?? [])
    .map((row) => buildSyntheticMessageFromStats(params.channelId, row as ConversationStatsFallbackRow))
    .find(Boolean) as ExternalMessageRow | undefined;

  return { messages: message ? [message] : [], nextCursor: null, hasMore: false };
}

// ── Leads (direct external read) ──────────────────────────────────

export async function fetchExternalLeads(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  tagIds?: string[];
}): Promise<{ leads: unknown[]; total: number }> {
  const ext = await getExternalClient();
  const pageSize = params.pageSize ?? 50;
  const page = params.page ?? 0;

  let query = ext
    .from("whatsapp_contacts")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,phone.ilike.%${params.search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`External leads fetch error: ${error.message}`);
  }

  return { leads: data ?? [], total: count ?? 0 };
}

export async function findExternalLeadByPhone(
  phoneVariants: string[]
): Promise<{ lead: unknown | null }> {
  const ext = await getExternalClient();
  const phoneFilter = phoneVariants
    .map((p) => `phone.eq.${p.replace(/\D/g, "")}`)
    .join(",");

  if (!phoneFilter) return { lead: null };

  const { data, error } = await ext
    .from("whatsapp_contacts")
    .select("*")
    .or(phoneFilter)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[externalDb] findExternalLeadByPhone error:", error.message);
    return { lead: null };
  }

  return { lead: data };
}

// ── Bulk Previews (direct external read) ──────────────────────────

export async function fetchBulkPreviews(
  conversations: Array<{ channelId: string; phoneVariants: string[] }>,
  impersonatedOrgId?: string | null
): Promise<BulkPreviewResult[]> {
  if (conversations.length === 0) return [];

  try {
    const data = await invokeExternalProxy<{ previews: BulkPreviewResult[] }>({
      action: "bulk_previews",
      conversations,
      impersonatedOrgId,
    });
    return data.previews ?? [];
  } catch (proxyError) {
    console.warn("[externalDb] Proxy fetch failed for bulk previews, trying direct read:", getErrorMessage(proxyError));
  }

  try {
    const ext = await getExternalClient(impersonatedOrgId);
    const results: BulkPreviewResult[] = [];

    // Process in small parallel batches to avoid overwhelming the DB
    const BATCH_SIZE = 10;
    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
      const batch = conversations.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (conv) => {
        const lookup = buildPhoneLookup(conv.phoneVariants);
        const phoneVariantsForFilter = Array.from(lookup.exact);
        const channelIdParts = phoneVariantsForFilter.map((phone) => `channel_id.eq.${phone}`);
        channelIdParts.push(`channel_id.eq.${conv.channelId}`);
        const channelIdFilter = channelIdParts.join(",");

        const { data, error } = await ext
          .from("whatsapp_messages")
          .select("content, message_type, direction, created_at, sender_name, sender_phone, metadata")
          .or(channelIdFilter)
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) {
          throw new Error(error.message);
        }

        const rows = (data ?? []) as ExternalMessageRow[];
        // Find first matching message
        for (const row of rows) {
          const dir = row.direction as "inbound" | "outbound";
          if (messageMatchesConversation(row, dir, lookup)) {
            return {
              channelId: conv.channelId,
              phone: conv.phoneVariants[0] ?? "",
              content: row.content,
              messageType: row.message_type,
              direction: row.direction,
              createdAt: row.created_at,
              senderName: row.sender_name,
              lastInboundAt: dir === "inbound" ? row.created_at : null,
            };
          }
        }
        return {
          channelId: conv.channelId,
          phone: conv.phoneVariants[0] ?? "",
          content: null,
          messageType: null,
          direction: null,
          createdAt: null,
          senderName: null,
          lastInboundAt: null,
        };
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  } catch (error) {
    console.error("[externalDb] Direct fallback failed for bulk previews:", getErrorMessage(error));
    return [];
  }
}

/**
 * Helper to derive a sidebar preview text from a bulk preview result.
 */
export function getPreviewTextFromBulkResult(result: BulkPreviewResult): string {
  if (result.content?.trim()) return result.content;
  if (result.messageType === "template") return "Template enviado";
  if (result.messageType === "image") return "[Imagem]";
  if (result.messageType === "video") return "[Vídeo]";
  if (result.messageType === "audio" || result.messageType === "ptt") return "[Áudio]";
  if (result.messageType === "document") return "[Documento]";
  if (result.messageType === "sticker") return "[Sticker]";
  if (result.direction === "inbound") return "[Mensagem recebida]";
  if (result.direction === "outbound") return "[Mensagem enviada]";
  return "";
}
