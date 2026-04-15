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

const HISTORY_SCAN_BATCH_SIZE = 150;
const HISTORY_SCAN_MAX_BATCHES = 8;

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
  lookup: PhoneLookup
): boolean {
  if (direction === "inbound") {
    return phoneMatchesLookup(message.sender_phone, lookup);
  }
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  return [meta.destination, meta.to, meta.phone, meta.contact_phone, meta.contactPhone, meta.recipient_phone, meta.recipientPhone]
    .some((c) => phoneMatchesLookup(c, lookup));
}

// ── Direct external DB fetch ──────────────────────────────────────

const SELECT_FIELDS =
  "id, channel_id, organization_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

async function fetchDirectionMessages(
  channelId: string,
  direction: "inbound" | "outbound",
  cursorFilter: string,
  pageSize: number,
  lookup: PhoneLookup,
  impersonatedOrgId?: string | null
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
    const { data, error } = await ext
      .from("whatsapp_messages")
      .select(SELECT_FIELDS)
      .or(channelIdFilter)
      .eq("direction", direction)
      .lt("created_at", scanCursor)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SCAN_BATCH_SIZE);

    if (error) {
      console.warn(`[externalDb] Direct ${direction} fetch failed:`, error.message);
      break;
    }

    const rows = (data ?? []) as ExternalMessageRow[];
    if (rows.length === 0) break;

    rows.forEach((row) => {
      if (!seen.has(row.id) && messageMatchesConversation(row, direction, lookup)) {
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
}): Promise<ExternalMessagePage> {
  const pageSize = params.pageSize ?? 25;
  const cursorFilter = params.cursor ?? new Date(Date.now() + 120_000).toISOString();
  const lookup = buildPhoneLookup(params.phoneVariants);

  const [inbound, outbound] = await Promise.all([
    fetchDirectionMessages(params.channelId, "inbound", cursorFilter, pageSize, lookup),
    fetchDirectionMessages(params.channelId, "outbound", cursorFilter, pageSize, lookup),
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
  conversations: Array<{ channelId: string; phoneVariants: string[] }>
): Promise<BulkPreviewResult[]> {
  if (conversations.length === 0) return [];

  const ext = await getExternalClient();
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

      const { data } = await ext
        .from("whatsapp_messages")
        .select("content, message_type, direction, created_at, sender_name, sender_phone, metadata")
        .or(channelIdFilter)
        .order("created_at", { ascending: false })
        .limit(5);

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
