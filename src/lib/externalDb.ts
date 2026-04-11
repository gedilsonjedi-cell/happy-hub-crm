/**
 * External Database Proxy Client
 *
 * Utility to call the external-db-proxy edge function for reading
 * whatsapp_messages and leads from the external Supabase instance.
 */
import { supabase } from "@/integrations/supabase/client";

const PROXY_FUNCTION = "external-db-proxy";
const PROXY_TIMEOUT_MS = 3500;

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

  const [inboundResult, outboundResult] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select(selectFields)
      .eq("channel_id", params.channelId)
      .eq("direction", "inbound")
      .or(inboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize),
    supabase
      .from("whatsapp_messages")
      .select(selectFields)
      .eq("channel_id", params.channelId)
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
