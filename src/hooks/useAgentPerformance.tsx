import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

export type AgentPeriod = "today" | "7d" | "15d" | "30d";

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

function getPeriodDate(period: AgentPeriod): string {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 86400000).toISOString();
    case "15d":
      return new Date(now.getTime() - 15 * 86400000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 86400000).toISOString();
  }
}

export function useAgentPerformance(period: AgentPeriod = "today") {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentPerformanceItem[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      const sinceDate = getPeriodDate(period);

      // Get channels for org
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels?.length) { setLoading(false); return; }
      const channelIds = channels.map(c => c.id);

      // Get assignments updated within the period
      const { data: allAssignments } = await supabase
        .from("conversation_assignments")
        .select("assigned_to, status, updated_at")
        .in("channel_id", channelIds)
        .gte("updated_at", sinceDate);

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
        .select("assigned_to, first_response_time_seconds")
        .eq("organization_id", effectiveOrganizationId)
        .gte("created_at", sinceDate)
        .not("assigned_to", "is", null);

      // Aggregate by user
      const agentMap = new Map<string, {
        open: number; unattended: number; resolved: number;
        responseTimes: number[];
      }>();

      const ensureAgent = (userId: string) => {
        if (!agentMap.has(userId)) {
          agentMap.set(userId, { open: 0, unattended: 0, resolved: 0, responseTimes: [] });
        }
        return agentMap.get(userId)!;
      };

      allAssignments?.forEach(a => {
        if (a.status === "archived") {
          if (a.assigned_to) ensureAgent(a.assigned_to).resolved++;
        } else {
          if (a.assigned_to) ensureAgent(a.assigned_to).open++;
        }
      });

      allAssignments?.forEach(a => {
        if (a.assigned_to && a.status === "pending") {
          ensureAgent(a.assigned_to).unattended++;
        }
      });

      metrics?.forEach(m => {
        if (!m.assigned_to) return;
        const entry = ensureAgent(m.assigned_to);
        if (m.first_response_time_seconds) entry.responseTimes.push(m.first_response_time_seconds);
      });

      profiles?.forEach(p => ensureAgent(p.user_id));

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
  }, [effectiveOrganizationId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { agents, loading, refetch: fetchData };
}
