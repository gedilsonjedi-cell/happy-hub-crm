/**
 * Conversation summary reads from the EXTERNAL Supabase database.
 *
 * The external DB has the canonical conversation_assignments + conversation_stats,
 * but does NOT have public.leads or public.profiles. We call the external RPC
 * to get the assignment+stats rows, then enrich with leads/profiles from the
 * internal DB (Lovable Cloud) so the existing mapping code keeps working.
 */
import { supabase } from "@/integrations/supabase/client";
import { getExternalClient } from "@/lib/externalSupabaseClient";

export interface ConversationSummaryExternalParams {
  channelIds: string[];
  organizationId: string;
  limit?: number;
  offset?: number;
  impersonatedOrgId?: string | null;
}

interface ExternalRpcRow {
  assignment_id: string;
  conversation_phone: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: string | null;
  sector_id: string | null;
  lead_id: string | null;
  assignment_updated_at: string | null;
  last_message_content: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  sender_name: string | null;
  is_bot_handling?: boolean | null;
  campaign_chatbot_id?: string | null;
  bot_paused_until?: string | null;
}

export interface EnrichedConversationSummaryRow extends ExternalRpcRow {
  updated_at?: string | null;
  last_message?: string | null;
  lead_name: string | null;
  lead_tags: string[] | null;
  assigned_to_name: string | null;
}

async function callExternalRpc(
  params: ConversationSummaryExternalParams
): Promise<ExternalRpcRow[]> {
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);

  const usePaginated = params.limit !== undefined || params.offset !== undefined;

  if (usePaginated) {
    const { data, error } = await ext.rpc("get_conversations_summary_paginated_ext", {
      p_channel_ids: params.channelIds,
      p_organization_id: params.organizationId,
      p_limit: params.limit ?? 100,
      p_offset: params.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as ExternalRpcRow[];
  }

  const { data, error } = await ext.rpc("get_conversations_summary_ext", {
    p_channel_ids: params.channelIds,
    p_organization_id: params.organizationId,
  });
  if (error) throw error;
  return (data ?? []) as ExternalRpcRow[];
}

async function fetchLeadsByIds(leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, { name: string | null; tags: string[] | null }>();
  const map = new Map<string, { name: string | null; tags: string[] | null }>();
  // Chunk in 500s to keep URL size sane
  for (let i = 0; i < leadIds.length; i += 500) {
    const chunk = leadIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, tags")
      .in("id", chunk);
    if (error) {
      console.warn("[conversationsExternal] lead enrichment failed:", error.message);
      continue;
    }
    (data ?? []).forEach((l: any) => {
      map.set(l.id, { name: l.name ?? null, tags: l.tags ?? null });
    });
  }
  return map;
}

async function fetchProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const map = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", chunk);
    if (error) {
      console.warn("[conversationsExternal] profile enrichment failed:", error.message);
      continue;
    }
    (data ?? []).forEach((p: any) => {
      map.set(p.user_id, p.display_name || p.email || "Atendente");
    });
  }
  return map;
}

export async function fetchConversationSummaryExternal(
  params: ConversationSummaryExternalParams
): Promise<EnrichedConversationSummaryRow[]> {
  if (!params.channelIds.length || !params.organizationId) return [];

  const rows = await callExternalRpc(params);
  if (rows.length === 0) return [];

  const leadIds = Array.from(
    new Set(rows.map((r) => r.lead_id).filter(Boolean) as string[])
  );
  const userIds = Array.from(
    new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[])
  );

  const [leadsMap, profilesMap] = await Promise.all([
    fetchLeadsByIds(leadIds),
    fetchProfilesByIds(userIds),
  ]);

  return rows.map((r) => {
    const lead = r.lead_id ? leadsMap.get(r.lead_id) : null;
    const profileName = r.assigned_to ? profilesMap.get(r.assigned_to) ?? null : null;
    return {
      ...r,
      updated_at: r.assignment_updated_at,
      last_message: r.last_message_content,
      lead_name: lead?.name ?? null,
      lead_tags: lead?.tags ?? null,
      assigned_to_name: profileName,
    };
  });
}
