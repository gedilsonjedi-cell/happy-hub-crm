/**
 * External Database Proxy Client
 *
 * Utility to call the external-db-proxy edge function for reading
 * whatsapp_messages and leads from the external Supabase instance.
 */
import { supabase } from "@/integrations/supabase/client";

const PROXY_FUNCTION = "external-db-proxy";
const PROXY_TIMEOUT_MS = 8000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke(PROXY_FUNCTION, {
      body,
    }),
    PROXY_TIMEOUT_MS,
    "Timeout loading external history"
  );

  if (error) {
    throw new Error(`External DB proxy error: ${error.message}`);
  }

  return data as T;
}

interface ConversationStatsFallbackRow {
  conversation_phone: string;
  last_message_content: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  sender_name: string | null;
}

function getSyntheticMessageDirection(
  row: ConversationStatsFallbackRow
): "inbound" | "outbound" {
  if (!row.last_inbound_at) {
    return "outbound";
  }

  if (!row.last_message_at) {
    return "inbound";
  }

  return new Date(row.last_inbound_at).getTime() >= new Date(row.last_message_at).getTime()
    ? "inbound"
    : "outbound";
}

function buildSyntheticMessageFromStats(
  channelId: string,
  row: ConversationStatsFallbackRow
): ExternalMessageRow | null {
  const createdAt = row.last_message_at ?? row.last_inbound_at;

  if (!createdAt) {
    return null;
  }

  const direction = getSyntheticMessageDirection(row);
  const content = row.last_message_content?.trim() || "";

  if (!content) {
    return null;
  }

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

// ── Messages ──────────────────────────────────────────────────────

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

export async function fetchExternalMessages(params: {
  channelId: string;
  phoneVariants: string[];
  cursor: string | null;
  pageSize?: number;
}): Promise<ExternalMessagePage> {
  return callProxy<ExternalMessagePage>({
    action: "messages",
    channelId: params.channelId,
    phoneVariants: params.phoneVariants,
    cursor: params.cursor,
    pageSize: params.pageSize ?? 25,
  });
}

/**
 * Fallback local fetch used when external history is unavailable for a conversation.
 * Keeps the same shape as external-db-proxy.
 */
export async function fetchInternalMessages(params: {
  channelId: string;
  phoneVariants: string[];
  cursor: string | null;
  pageSize?: number;
}): Promise<ExternalMessagePage> {
  const pageSize = params.pageSize ?? 25;
  const cursorFilter = params.cursor ?? new Date(Date.now() + 120_000).toISOString();

  const selectFields =
    "id, channel_id, organization_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

  const inboundPhoneFilter = params.phoneVariants
    .map((phone) => `sender_phone.eq.${phone}`)
    .join(",");

  const outboundPhoneFilter = params.phoneVariants
    .map((phone) => `metadata->>destination.eq.${phone}`)
    .join(",");

  const channelIdStr = String(params.channelId);
  const [inboundResult, outboundResult] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select(selectFields)
      .filter("channel_id", "eq", channelIdStr)
      .eq("direction", "inbound")
      .or(inboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize),
    supabase
      .from("whatsapp_messages")
      .select(selectFields)
      .filter("channel_id", "eq", channelIdStr)
      .eq("direction", "outbound")
      .or(outboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize),
  ]);

  if (inboundResult.error) {
    throw new Error(`Internal messages fetch error (inbound): ${inboundResult.error.message}`);
  }

  if (outboundResult.error) {
    throw new Error(`Internal messages fetch error (outbound): ${outboundResult.error.message}`);
  }

  const merged = [...(inboundResult.data ?? []), ...(outboundResult.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const seen = new Set<string>();
  const unique = merged.filter((msg) => {
    if (seen.has(msg.id)) return false;
    seen.add(msg.id);
    return true;
  });

  const page = unique.slice(0, pageSize);
  const hasMore = unique.length >= pageSize;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  return {
    messages: page as ExternalMessageRow[],
    nextCursor,
    hasMore,
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

  const channelIdStr = String(params.channelId);
  const { data, error } = await supabase
    .from("conversation_stats")
    .select(
      "conversation_phone, last_message_content, last_message_at, last_inbound_at, unread_count, sender_name"
    )
    .filter("channel_id", "eq", channelIdStr)
    .or(statsPhoneFilter)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(3);

  if (error) {
    throw new Error(`Conversation stats fallback error: ${error.message}`);
  }

  const message = (data ?? [])
    .map((row) =>
      buildSyntheticMessageFromStats(
        params.channelId,
        row as ConversationStatsFallbackRow
      )
    )
    .find(Boolean) as ExternalMessageRow | undefined;

  return {
    messages: message ? [message] : [],
    nextCursor: null,
    hasMore: false,
  };
}

// ── Leads ─────────────────────────────────────────────────────────

export async function fetchExternalLeads(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  tagIds?: string[];
}): Promise<{ leads: unknown[]; total: number }> {
  return callProxy<{ leads: unknown[]; total: number }>({
    action: "leads",
    ...params,
  });
}

export async function findExternalLeadByPhone(
  phoneVariants: string[]
): Promise<{ lead: unknown | null }> {
  return callProxy<{ lead: unknown | null }>({
    action: "lead_by_phone",
    phoneVariants,
  });
}

// ── Bulk Previews ─────────────────────────────────────────────────

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

/**
 * Fetch the latest message preview for multiple conversations in a single
 * proxy call instead of N individual external-db-proxy requests.
 */
export async function fetchBulkPreviews(
  conversations: Array<{ channelId: string; phoneVariants: string[] }>
): Promise<BulkPreviewResult[]> {
  if (conversations.length === 0) return [];

  const { previews } = await callProxy<{ previews: BulkPreviewResult[] }>({
    action: "bulk_previews",
    conversations,
  });

  return previews || [];
}

/**
 * Helper to derive a sidebar preview text from a bulk preview result.
 */
export function getPreviewTextFromBulkResult(result: BulkPreviewResult): string {
  if (result.content?.trim()) {
    return result.content;
  }

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
