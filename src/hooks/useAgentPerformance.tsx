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
      // Get channels for org
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels?.length) { setLoading(false); return; }
      const channelIds = channels.map(c => c.id);

      // Get all assignments for org channels
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
        .select("assigned_to, first_response_time_seconds")
        .eq("organization_id", effectiveOrganizationId)
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

      // Count assignments per agent
      allAssignments?.forEach(a => {
        if (a.status === "archived") {
          // Resolved: only count if assigned
          if (a.assigned_to) {
            ensureAgent(a.assigned_to).resolved++;
          }
        } else {
          // Active conversations (in_progress, pending, active, etc.)
          if (a.assigned_to) {
            ensureAgent(a.assigned_to).open++;
          }
        }
      });

      // Count unattended per agent: conversations assigned to agent but still pending
      allAssignments?.forEach(a => {
        if (a.assigned_to && a.status === "pending") {
          ensureAgent(a.assigned_to).unattended++;
        }
      });

      // Add response times from metrics
      metrics?.forEach(m => {
        if (!m.assigned_to) return;
        const entry = ensureAgent(m.assigned_to);
        if (m.first_response_time_seconds) entry.responseTimes.push(m.first_response_time_seconds);
      });

      // Include profiles that have no assignments
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
  }, [effectiveOrganizationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { agents, loading, refetch: fetchData };
}
