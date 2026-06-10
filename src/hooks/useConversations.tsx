import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchConversationSummaryExternal } from "@/lib/conversationsExternal";
import { getExternalAssignments } from "@/lib/externalAssignments";
import { refreshExternalToken } from "@/lib/externalSupabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  lastMessage: string;
  lastMessageTime: string;
  lastInboundTime: string | null;
  unreadCount: number;
  channelId: string | null;
  status: "pending" | "in_progress" | "resolved" | "archived" | "active";
  assignedTo: string | null;
  assignedToName: string | null;
  sectorId: string | null;
  tags: string[] | null;
  leadId: string | null;
}

export interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
}

interface UseConversationsOptions {
  channels: Channel[];
  sectorIds: string[];
  canSeeSector: (sectorId: string | null) => boolean;
}

interface LeadInfo {
  name: string;
  tags: string[] | null;
}

export function useConversations({ channels, sectorIds, canSeeSector }: UseConversationsOptions) {
  const { user } = useAuth();
  const { effectiveOrganizationId, isImpersonating, impersonatedOrganizationId } = useEffectiveOrganizationId();
  const externalImpersonatedOrgId = isImpersonating ? impersonatedOrganizationId ?? null : null;
  
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  
  const leadsMapRef = useRef<{
    byPhone: Map<string, LeadInfo>;
    bySuffix: Map<string, LeadInfo>;
  }>({ byPhone: new Map(), bySuffix: new Map() });
  
  const profilesMapRef = useRef<Map<string, string>>(new Map());

  const conversations = useMemo(() => 
    allConversations.filter(c => canSeeSector(c.sectorId)),
    [allConversations, canSeeSector]
  );

  // ─── Primary fetch using RPC ────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (channels.length === 0 || !effectiveOrganizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const channelIds = channels.map(c => c.id);

    try {
      // Single external RPC call (reads from external Supabase via direct JWT)
      let rows: any[] | null = null;
      let error: any = null;
      try {
        rows = await fetchConversationSummaryExternal({
          channelIds,
          organizationId: effectiveOrganizationId!,
          impersonatedOrgId: externalImpersonatedOrgId,
        });
      } catch (e) {
        error = e;
      }

      if (error) {
        console.error("External conversations summary error:", error);
        // Fallback to legacy fetch if RPC fails
        await fetchConversationsLegacy();
        return;
      }

      // Build profiles map from results for later use
      const profilesMap = new Map<string, string>();
      (rows || []).forEach((r: any) => {
        if (r.assigned_to && r.assigned_to_name) {
          profilesMap.set(r.assigned_to, r.assigned_to_name);
        }
      });
      profilesMapRef.current = profilesMap;

      const mapped: Conversation[] = (rows || []).map((r: any) => {
        const normalizedPhone = (r.conversation_phone || '').replace(/\D/g, '');
        const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;

        let mappedStatus: Conversation["status"] = "pending";
        if (r.status === "active" || r.status === "in_progress") mappedStatus = "in_progress";
        else if (r.status === "archived") mappedStatus = "archived";
        else if (r.status === "resolved") mappedStatus = "resolved";
        else if (r.status === "pending") mappedStatus = "pending";

        return {
          id: r.assignment_id,
          phone: displayPhone,
          name: r.lead_name || r.sender_name || null,
          lastMessage: r.last_message || "",
          lastMessageTime: r.last_message_at || r.updated_at,
          lastInboundTime: r.last_inbound_at || null,
          unreadCount: Number(r.unread_count) || 0,
          channelId: r.channel_id,
          status: mappedStatus,
          assignedTo: r.assigned_to,
          assignedToName: r.assigned_to_name || null,
          sectorId: r.sector_id,
          tags: r.lead_tags || null,
          leadId: r.lead_id,
        };
      });

      setAllConversations(mapped);
      setLoading(false);
    } catch (err) {
      console.error("Error in fetchConversations RPC:", err);
      setLoading(false);
    }
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId]);

  // ─── Legacy fallback (kept for compatibility) ───────────────────
  const fetchConversationsLegacy = useCallback(async () => {
    if (channels.length === 0 || !effectiveOrganizationId) {
      setLoading(false);
      return;
    }

    const channelIds = channels.map(c => c.id);
    const channelFilter = channelIds.map(id => `channel_id.eq.${id}`).join(',');

    const fetchAllAssignments = async () => {
      const ext = await getExternalAssignments();
      const all: any[] = []; let from = 0; let hasMore = true;
      while (hasMore) {
        const { data, error } = await ext.from("conversation_assignments")
          .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
          .or(channelFilter).neq("status", "archived")
          .order("updated_at", { ascending: false }).range(from, from + 999);
        if (error || !data || data.length === 0) hasMore = false;
        else { all.push(...data); from += 1000; hasMore = data.length === 1000; }
      }
      return { data: all, error: null };
    };

    const fetchAllProfiles = async () => {
      const { data, error } = await supabase.from("profiles")
        .select("user_id, display_name, email").limit(1000);
      return { data: data || [], error };
    };

    const [assignmentsResult, profilesResult] = await Promise.all([
      fetchAllAssignments(), fetchAllProfiles()
    ]);

    if (assignmentsResult.error) { setLoading(false); return; }

    const profilesMap = new Map<string, string>();
    profilesResult.data?.forEach((p: any) => {
      profilesMap.set(p.user_id, p.display_name || p.email || 'Atendente');
    });
    profilesMapRef.current = profilesMap;

    const mapped: Conversation[] = (assignmentsResult.data || []).map((a: any) => {
      const normalizedPhone = a.conversation_phone.replace(/\D/g, '');
      const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;
      let mappedStatus: Conversation["status"] = "pending";
      if (a.status === "active" || a.status === "in_progress") mappedStatus = "in_progress";
      else if (a.status === "archived") mappedStatus = "archived";
      else if (a.status === "resolved") mappedStatus = "resolved";
      return {
        id: a.id, phone: displayPhone, name: null,
        lastMessage: "", lastMessageTime: a.updated_at,
        lastInboundTime: null, unreadCount: 0, channelId: a.channel_id,
        status: mappedStatus, assignedTo: a.assigned_to,
        assignedToName: a.assigned_to ? profilesMap.get(a.assigned_to) || null : null,
        sectorId: a.sector_id, tags: null, leadId: a.lead_id,
      };
    });

    mapped.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
    setAllConversations(mapped);
    setLoading(false);
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId]);

  // Global search
  const searchConversationsGlobal = useCallback(async (searchTerm: string): Promise<Conversation[]> => {
    if (!searchTerm.trim() || channels.length === 0 || !effectiveOrganizationId) return [];

    setSearchingGlobal(true);
    const channelIds = channels.map(c => c.id);
    const normalizedSearch = searchTerm.replace(/\D/g, '');
    
    try {
      const channelFilter = channelIds.map(id => `channel_id.eq.${id}`).join(',');
      const { data: assignments, error } = await supabase
        .from("conversation_assignments")
        .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
        .or(channelFilter)
        .or(`conversation_phone.ilike.%${normalizedSearch}%,conversation_phone.ilike.%${searchTerm}%`)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error || !assignments) { setSearchingGlobal(false); return []; }

      const { data: leadsByName } = await supabase
        .from("leads")
        .select("id, phone, name, tags")
        .eq("organization_id", effectiveOrganizationId)
        .ilike("name", `%${searchTerm}%`)
        .limit(50);

      const leadPhones = (leadsByName || []).map(l => l.phone.replace(/\D/g, ''));
      
      let additionalAssignments: typeof assignments = [];
      if (leadPhones.length > 0) {
        const phoneConditions = leadPhones.map(p => `conversation_phone.ilike.%${p.slice(-8)}%`).join(',');
          const { data: byLeadPhone } = await supabase
            .from("conversation_assignments")
            .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
            .or(channelFilter)
            .or(phoneConditions)
            .order("updated_at", { ascending: false })
            .limit(50);
        additionalAssignments = byLeadPhone || [];
      }

      const allAssignments = [...assignments, ...additionalAssignments];
      const uniqueAssignments = allAssignments.filter((a, idx, self) => idx === self.findIndex(b => b.id === a.id));

      const searchResults: Conversation[] = uniqueAssignments.map(assignment => {
        const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
        const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;
        const matchingLead = (leadsByName || []).find(l => l.phone.replace(/\D/g, '').slice(-8) === normalizedPhone.slice(-8));

        let mappedStatus: Conversation["status"] = "pending";
        if (assignment.status === "active" || assignment.status === "in_progress") mappedStatus = "in_progress";
        else if (assignment.status === "archived") mappedStatus = "archived";
        else if (assignment.status === "resolved") mappedStatus = "resolved";

        return {
          id: assignment.id, phone: displayPhone,
          name: matchingLead?.name || null, lastMessage: "",
          lastMessageTime: assignment.updated_at, lastInboundTime: null,
          unreadCount: 0, channelId: assignment.channel_id,
          status: mappedStatus, assignedTo: assignment.assigned_to,
          assignedToName: assignment.assigned_to ? profilesMapRef.current.get(assignment.assigned_to) || null : null,
          sectorId: assignment.sector_id, tags: matchingLead?.tags || null,
          leadId: assignment.lead_id,
        };
      });

      setSearchingGlobal(false);
      return searchResults;
    } catch (error) {
      console.error("Error searching conversations:", error);
      setSearchingGlobal(false);
      return [];
    }
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId]);

  const updateConversation = useCallback((conversationId: string, updates: Partial<Conversation>) => {
    setAllConversations(prev => prev.map(c => c.id === conversationId ? { ...c, ...updates } : c));
  }, []);

  const addConversation = useCallback((conversation: Conversation) => {
    setAllConversations(prev => {
      const exists = prev.some(c => c.id === conversation.id);
      if (exists) return prev.map(c => c.id === conversation.id ? conversation : c);
      return [conversation, ...prev];
    });
  }, []);

  const getConversationKey = useCallback((conv: Conversation) => {
    return `${conv.channelId || 'unknown'}_${conv.phone.replace(/\D/g, '')}`;
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    allConversations,
    loading,
    searchingGlobal,
    fetchConversations,
    searchConversationsGlobal,
    updateConversation,
    addConversation,
    getConversationKey,
    leadsMapRef,
    profilesMapRef
  };
}
