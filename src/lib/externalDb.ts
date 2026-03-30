/**
 * External Database Proxy Client
 *
 * Utility to call the external-db-proxy edge function for reading
 * whatsapp_messages and leads from the external Supabase instance.
 */
import { supabase } from "@/integrations/supabase/client";

const PROXY_FUNCTION = "external-db-proxy";

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION, {
    body,
  });

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
    pageSize: params.pageSize ?? 20,
  });
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
