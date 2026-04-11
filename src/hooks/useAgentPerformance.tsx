import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

export interface AgentPerformanceItem {
  userId: string;
  displayName: string;
  email: string;
  isAvailable: boolean;
  openCount: number;
  unattendedCount: number;
  resolvedCount: number;
  avgResponseTime: number;
}

export function useAgentPerformance() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentPerformanceItem[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      // Get all assignments for this org
      const { data: assignments } = await supabase
        .from("conversation_assignments")
        .select("assigned_to, status, channel_id")
        .eq("channel_id", "") // will fix below
        .limit(1);

      // Get channels first
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels?.length) { setLoading(false); return; }
      const channelIds = channels.map(c => c.id);

      const { data: allAssignments } = await supabase
        .from("conversation_assignments")
        .select("assigned_to, status")
        .in("channel_id", channelIds);

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("organization_id", effectiveOrganizationId);

      // Get availability
      const { data: availability } = await supabase
        .from("attendant_availability")
        .select("user_id, is_available")
        .eq("organization_id", effectiveOrganizationId);

      // Get metrics for avg response time
      const { data: metrics } = await supabase
        .from("conversation_metrics")
        .select("assigned_to, first_response_time_seconds, resolved_at")
        .eq("organization_id", effectiveOrganizationId)
        .not("assigned_to", "is", null);

      // Aggregate by user
      const agentMap = new Map<string, {
        open: number; unattended: number; resolved: number;
        responseTimes: number[];
      }>();

      // Count assignments per agent
      allAssignments?.forEach(a => {
        if (!a.assigned_to) return;
        if (!agentMap.has(a.assigned_to)) {
          agentMap.set(a.assigned_to, { open: 0, unattended: 0, resolved: 0, responseTimes: [] });
        }
        const entry = agentMap.get(a.assigned_to)!;
        if (a.status === "active" || a.status === "pending") entry.open++;
        if (a.status === "archived") entry.resolved++;
      });

      // Count unattended (assigned but no response yet) - assignments with no assigned_to
      const unattendedTotal = allAssignments?.filter(a => !a.assigned_to && a.status !== "archived").length || 0;

      // Add response times from metrics
      metrics?.forEach(m => {
        if (!m.assigned_to) return;
        if (!agentMap.has(m.assigned_to)) {
          agentMap.set(m.assigned_to, { open: 0, unattended: 0, resolved: 0, responseTimes: [] });
        }
        const entry = agentMap.get(m.assigned_to)!;
        if (m.first_response_time_seconds) entry.responseTimes.push(m.first_response_time_seconds);
        if (m.resolved_at) entry.resolved = Math.max(entry.resolved, entry.resolved);
      });

      // Also include profiles that have no assignments yet
      profiles?.forEach(p => {
        if (!agentMap.has(p.user_id)) {
          agentMap.set(p.user_id, { open: 0, unattended: 0, resolved: 0, responseTimes: [] });
        }
      });

      const result: AgentPerformanceItem[] = [];
      agentMap.forEach((data, userId) => {
        const profile = profiles?.find(p => p.user_id === userId);
        const avail = availability?.find(a => a.user_id === userId);
        const avgRT = data.responseTimes.length > 0
          ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
          : 0;

        result.push({
          userId,
          displayName: profile?.display_name || profile?.email?.split("@")[0] || "Atendente",
          email: profile?.email || "",
          isAvailable: avail?.is_available || false,
          openCount: data.open,
          unattendedCount: data.unattended,
          resolvedCount: data.resolved,
          avgResponseTime: avgRT,
        });
      });

      setAgents(result.sort((a, b) => b.openCount - a.openCount));
    } catch (err) {
      console.error("Agent performance fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { agents, loading, refetch: fetchData };
}
