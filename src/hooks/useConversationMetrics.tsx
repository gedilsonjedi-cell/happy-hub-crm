import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

interface MetricsSummary {
  avgFirstResponseTime: number; // TMR - segundos
  avgHandlingTime: number; // TMA - segundos
  avgWaitTime: number; // TME - segundos
  totalConversations: number;
  resolvedToday: number;
}

interface AttendantMetric {
  userId: string;
  displayName: string;
  email: string;
  avgFirstResponseTime: number;
  avgHandlingTime: number;
  avgWaitTime: number;
  conversationCount: number;
  resolvedCount: number;
  isAvailable: boolean;
}

interface SectorMetric {
  sectorId: string;
  sectorName: string;
  avgFirstResponseTime: number;
  avgHandlingTime: number;
  avgWaitTime: number;
  conversationCount: number;
}

export function useConversationMetrics(dateRange?: { start: Date; end: Date }) {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MetricsSummary>({
    avgFirstResponseTime: 0,
    avgHandlingTime: 0,
    avgWaitTime: 0,
    totalConversations: 0,
    resolvedToday: 0,
  });
  const [byAttendant, setByAttendant] = useState<AttendantMetric[]>([]);
  const [bySector, setBySector] = useState<SectorMetric[]>([]);

  // Memoize date range strings to prevent unnecessary re-fetches
  const startDateStr = dateRange?.start?.toISOString() || null;
  const endDateStr = dateRange?.end?.toISOString() || null;

  const fetchMetrics = useCallback(async () => {
    if (!effectiveOrganizationId) return;

    setLoading(true);
    try {
      const startDate = startDateStr || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = endDateStr || new Date().toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch metrics from conversation_metrics table
      const { data: metrics, error } = await supabase
        .from("conversation_metrics")
        .select("*")
        .eq("organization_id", effectiveOrganizationId)
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      if (error) throw error;

      if (!metrics || metrics.length === 0) {
        // Fallback: Calculate from whatsapp_messages
        await calculateMetricsFromMessages(todayStart);
        return;
      }

      // Calculate summary
      const validMetrics = metrics.filter(m => m.first_response_time_seconds != null);
      const avgFirstResponseTime = validMetrics.length > 0
        ? validMetrics.reduce((sum, m) => sum + (m.first_response_time_seconds || 0), 0) / validMetrics.length
        : 0;

      const handlingMetrics = metrics.filter(m => m.total_handling_time_seconds != null);
      const avgHandlingTime = handlingMetrics.length > 0
        ? handlingMetrics.reduce((sum, m) => sum + (m.total_handling_time_seconds || 0), 0) / handlingMetrics.length
        : 0;

      const waitMetrics = metrics.filter(m => m.wait_time_seconds != null);
      const avgWaitTime = waitMetrics.length > 0
        ? waitMetrics.reduce((sum, m) => sum + (m.wait_time_seconds || 0), 0) / waitMetrics.length
        : 0;

      const resolvedToday = metrics.filter(m => 
        m.resolved_at && new Date(m.resolved_at) >= todayStart
      ).length;

      setSummary({
        avgFirstResponseTime,
        avgHandlingTime,
        avgWaitTime,
        totalConversations: metrics.length,
        resolvedToday,
      });

      // Calculate by attendant
      const attendantMap = new Map<string, {
        times: number[];
        handling: number[];
        wait: number[];
        resolved: number;
      }>();

      metrics.forEach(m => {
        if (!m.assigned_to) return;
        if (!attendantMap.has(m.assigned_to)) {
          attendantMap.set(m.assigned_to, { times: [], handling: [], wait: [], resolved: 0 });
        }
        const entry = attendantMap.get(m.assigned_to)!;
        if (m.first_response_time_seconds) entry.times.push(m.first_response_time_seconds);
        if (m.total_handling_time_seconds) entry.handling.push(m.total_handling_time_seconds);
        if (m.wait_time_seconds) entry.wait.push(m.wait_time_seconds);
        if (m.resolved_at) entry.resolved++;
      });

      // Fetch profiles for display names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("organization_id", effectiveOrganizationId);

      // Fetch availability
      const { data: availability } = await supabase
        .from("attendant_availability")
        .select("user_id, is_available")
        .eq("organization_id", effectiveOrganizationId);

      const attendantMetrics: AttendantMetric[] = [];
      attendantMap.forEach((data, userId) => {
        const profile = profiles?.find(p => p.user_id === userId);
        const avail = availability?.find(a => a.user_id === userId);
        
        attendantMetrics.push({
          userId,
          displayName: profile?.display_name || profile?.email || "Atendente",
          email: profile?.email || "",
          avgFirstResponseTime: data.times.length > 0 ? data.times.reduce((a, b) => a + b, 0) / data.times.length : 0,
          avgHandlingTime: data.handling.length > 0 ? data.handling.reduce((a, b) => a + b, 0) / data.handling.length : 0,
          avgWaitTime: data.wait.length > 0 ? data.wait.reduce((a, b) => a + b, 0) / data.wait.length : 0,
          conversationCount: data.times.length + data.handling.length,
          resolvedCount: data.resolved,
          isAvailable: avail?.is_available || false,
        });
      });

      setByAttendant(attendantMetrics.sort((a, b) => b.resolvedCount - a.resolvedCount));

      // Calculate by sector
      const sectorMap = new Map<string, {
        times: number[];
        handling: number[];
        wait: number[];
      }>();

      metrics.forEach(m => {
        if (!m.sector_id) return;
        if (!sectorMap.has(m.sector_id)) {
          sectorMap.set(m.sector_id, { times: [], handling: [], wait: [] });
        }
        const entry = sectorMap.get(m.sector_id)!;
        if (m.first_response_time_seconds) entry.times.push(m.first_response_time_seconds);
        if (m.total_handling_time_seconds) entry.handling.push(m.total_handling_time_seconds);
        if (m.wait_time_seconds) entry.wait.push(m.wait_time_seconds);
      });

      // Fetch sector names
      const { data: sectors } = await supabase
        .from("sectors")
        .select("id, name")
        .eq("organization_id", effectiveOrganizationId);

      const sectorMetrics: SectorMetric[] = [];
      sectorMap.forEach((data, sectorId) => {
        const sector = sectors?.find(s => s.id === sectorId);
        sectorMetrics.push({
          sectorId,
          sectorName: sector?.name || "Sem setor",
          avgFirstResponseTime: data.times.length > 0 ? data.times.reduce((a, b) => a + b, 0) / data.times.length : 0,
          avgHandlingTime: data.handling.length > 0 ? data.handling.reduce((a, b) => a + b, 0) / data.handling.length : 0,
          avgWaitTime: data.wait.length > 0 ? data.wait.reduce((a, b) => a + b, 0) / data.wait.length : 0,
          conversationCount: data.times.length,
        });
      });

      setBySector(sectorMetrics.sort((a, b) => b.conversationCount - a.conversationCount));

    } catch (error) {
      console.error("Error fetching conversation metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, startDateStr, endDateStr]);

  const calculateMetricsFromMessages = async (todayStart: Date) => {
    try {
      // Get channels for this org
      const { data: channels } = await (supabase as any)
        .from("channels_public")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels || channels.length === 0) {
        setLoading(false);
        return;
      }

      const channelIds = channels.map((c: any) => c.id);

      // Calculate from whatsapp_messages (reduced limit)
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("direction, sender_phone, created_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: true })
        .limit(500);

      if (!messages || messages.length === 0) {
        setLoading(false);
        return;
      }

      // Group by phone and calculate response times
      const messagesByPhone: Record<string, Array<{ direction: string; created_at: string }>> = {};
      messages.forEach(msg => {
        if (!messagesByPhone[msg.sender_phone]) {
          messagesByPhone[msg.sender_phone] = [];
        }
        messagesByPhone[msg.sender_phone].push(msg);
      });

      let totalResponseTime = 0;
      let responseCount = 0;

      Object.values(messagesByPhone).forEach(phoneMessages => {
        for (let i = 1; i < phoneMessages.length; i++) {
          if (phoneMessages[i - 1].direction === "inbound" && phoneMessages[i].direction === "outbound") {
            const inboundTime = new Date(phoneMessages[i - 1].created_at).getTime();
            const outboundTime = new Date(phoneMessages[i].created_at).getTime();
            const diffSeconds = (outboundTime - inboundTime) / 1000;
            if (diffSeconds > 0 && diffSeconds < 86400) {
              totalResponseTime += diffSeconds;
              responseCount++;
            }
          }
        }
      });

      const avgFirstResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

      // Count resolved today from assignments
      const { count: resolvedToday } = await supabase
        .from("conversation_assignments")
        .select("*", { count: "exact", head: true })
        .in("channel_id", channelIds)
        .eq("status", "archived")
        .gte("updated_at", todayStart.toISOString());

      setSummary({
        avgFirstResponseTime,
        avgHandlingTime: 0,
        avgWaitTime: 0,
        totalConversations: Object.keys(messagesByPhone).length,
        resolvedToday: resolvedToday || 0,
      });

    } catch (error) {
      console.error("Error calculating metrics from messages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}min`;
  };

  return {
    loading,
    summary,
    byAttendant,
    bySector,
    formatTime,
    refetch: fetchMetrics,
  };
}
