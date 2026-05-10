/**
 * Conversation summary reads from the EXTERNAL Supabase database.
 *
 * The external DB has the canonical conversation_assignments + conversation_stats,
 * but does NOT have public.leads or public.profiles. We call external RPCs
 * to get assignment+stats rows, then enrich with leads/profiles from the
 * internal DB so the existing mapping code keeps working.
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

async function fetchLeadsByIds(leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, { name: string | null; tags: string[] | null }>();
  const map = new Map<string, { name: string | null; tags: string[] | null }>();
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

async function enrichRows(rows: ExternalRpcRow[]): Promise<EnrichedConversationSummaryRow[]> {
  if (rows.length === 0) return [];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean) as string[]));
  const userIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[]));
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

export async function fetchConversationSummaryExternal(
  params: ConversationSummaryExternalParams
): Promise<EnrichedConversationSummaryRow[]> {
  if (!params.channelIds.length || !params.organizationId) return [];
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  const usePaginated = params.limit !== undefined || params.offset !== undefined;
  const { data, error } = usePaginated
    ? await ext.rpc("get_conversations_summary_paginated_ext", {
        p_channel_ids: params.channelIds,
        p_organization_id: params.organizationId,
        p_limit: params.limit ?? 100,
        p_offset: params.offset ?? 0,
      })
    : await ext.rpc("get_conversations_summary_ext", {
        p_channel_ids: params.channelIds,
        p_organization_id: params.organizationId,
      });
  if (error) throw error;
  return enrichRows((data ?? []) as ExternalRpcRow[]);
}

export async function fetchAttendantConversationsExternal(params: {
  userId: string;
  channelIds: string[];
  organizationId: string;
  limit?: number;
  impersonatedOrgId?: string | null;
}): Promise<EnrichedConversationSummaryRow[]> {
  if (!params.channelIds.length || !params.organizationId) return [];
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  const { data, error } = await ext.rpc("get_attendant_conversations_ext", {
    p_user_id: params.userId,
    p_channel_ids: params.channelIds,
    p_organization_id: params.organizationId,
    p_sector_ids: (params as any).sectorIds ?? null,
    p_limit: params.limit ?? 500,
  });
  if (error) throw error;
  return enrichRows((data ?? []) as ExternalRpcRow[]);
}

export async function fetchUnreadConversationsExternal(params: {
  channelIds: string[];
  organizationId: string;
  impersonatedOrgId?: string | null;
}): Promise<EnrichedConversationSummaryRow[]> {
  if (!params.channelIds.length || !params.organizationId) return [];
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  const { data, error } = await ext.rpc("get_unread_conversations_full_ext", {
    p_channel_ids: params.channelIds,
    p_organization_id: params.organizationId,
  });
  if (error) throw error;
  return enrichRows((data ?? []) as ExternalRpcRow[]);
}

export async function searchConversationsGlobalExternal(params: {
  channelIds: string[];
  organizationId: string;
  searchTerm: string;
  limit?: number;
  impersonatedOrgId?: string | null;
}): Promise<EnrichedConversationSummaryRow[]> {
  if (!params.channelIds.length || !params.organizationId) return [];
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  const { data, error } = await ext.rpc("search_conversations_global_ext", {
    p_channel_ids: params.channelIds,
    p_organization_id: params.organizationId,
    p_search_term: params.searchTerm,
    p_limit: params.limit ?? 50,
  });
  if (error) throw error;
  // Note: search-by-name won't match leads (since leads aren't on external),
  // but it still matches phone + sender_name. We enrich and re-filter client-side
  // to also catch lead-name matches in the enriched set.
  const enriched = await enrichRows((data ?? []) as ExternalRpcRow[]);
  return enriched;
}

/** Read a single assignment by channel+phone, going through external client (RLS-isolated). */
export async function fetchAssignmentByPhoneExternal(params: {
  channelId: string;
  phone: string;
  impersonatedOrgId?: string | null;
}): Promise<{ id: string; assigned_to: string | null; sector_id: string | null; status: string | null; lead_id: string | null } | null> {
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  const norm = params.phone.replace(/\D/g, "");
  const { data, error } = await ext
    .from("conversation_assignments")
    .select("id, assigned_to, sector_id, status, lead_id")
    .eq("channel_id", params.channelId)
    .or(`conversation_phone.eq.${norm},conversation_phone.eq.+${norm}`)
    .maybeSingle();
  if (error) {
    console.warn("[conversationsExternal] read assignment failed:", error.message);
    return null;
  }
  return (data as any) ?? null;
}

/** Bulk read assignments for sync — returns minimal shape per channel set. */
export async function fetchAssignmentsByChannelsExternal(params: {
  channelIds: string[];
  status?: "archived" | "not_archived";
  limit?: number;
  impersonatedOrgId?: string | null;
}): Promise<Array<{ id: string; conversation_phone: string; channel_id: string; assigned_to: string | null; status: string | null; sector_id: string | null; lead_id: string | null; updated_at: string }>> {
  if (!params.channelIds.length) return [];
  const ext = await getExternalClient(params.impersonatedOrgId ?? undefined);
  let q = ext
    .from("conversation_assignments")
    .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
    .in("channel_id", params.channelIds)
    .order("updated_at", { ascending: false });
  if (params.status === "archived") q = q.eq("status", "archived");
  else if (params.status === "not_archived") q = q.neq("status", "archived");
  if (params.limit) q = q.limit(params.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any;
}
