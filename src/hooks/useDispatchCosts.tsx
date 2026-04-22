import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

interface DispatchCostsByType {
  marketing: number;
  utility: number;
  service: number;
}

interface DispatchCountsByType {
  marketing: number;
  utility: number;
  service: number;
}

// Taxa de conversão USD para BRL
const USD_TO_BRL_RATE = 6.0;

export function useDispatchCosts() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dispatch-costs", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) {
        return {
          summary: { daily: 0, weekly: 0, monthly: 0, total: 0 },
          byType: { marketing: 0, utility: 0, service: 0 },
          counts: { marketing: 0, utility: 0, service: 0 },
        };
      }

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Buscar canais da organização primeiro
      const { data: channels } = await (supabase as any)
        .from("channels_public")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels || channels.length === 0) {
        return {
          summary: { daily: 0, weekly: 0, monthly: 0, total: 0 },
          byType: { marketing: 0, utility: 0, service: 0 },
          counts: { marketing: 0, utility: 0, service: 0 },
        };
      }

      const channelIds = channels.map((c: any) => c.id);

      // Buscar apenas mensagens do mês atual com limite razoável
      const { data: messages, error } = await supabase
        .from("whatsapp_messages")
        .select("metadata, created_at")
        .in("channel_id", channelIds)
        .eq("direction", "outbound")
        .in("status", ["delivered", "sent", "read"])
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) {
        console.error("Error fetching dispatch data:", error);
        throw error;
      }

      if (!messages || messages.length === 0) {
        return {
          summary: { daily: 0, weekly: 0, monthly: 0, total: 0 },
          byType: { marketing: 0, utility: 0, service: 0 },
          counts: { marketing: 0, utility: 0, service: 0 },
        };
      }

      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      let daily = 0;
      let weekly = 0;
      let monthly = 0;
      let total = 0;
      const typeBreakdown: DispatchCostsByType = { marketing: 0, utility: 0, service: 0 };
      const typeCounts: DispatchCountsByType = { marketing: 0, utility: 0, service: 0 };

      messages.forEach((msg) => {
        const metadata = msg.metadata as Record<string, unknown> | null;
        if (!metadata) return;

        const costUSD = Number(metadata.cost || 0);
        const costBRL = costUSD * USD_TO_BRL_RATE;
        const dispatchType = (metadata.dispatch_type as string) || "service";
        const msgDate = new Date(msg.created_at);

        total += costBRL;
        monthly += costBRL;

        // Adicionar ao breakdown por tipo
        if (dispatchType === "marketing") {
          typeBreakdown.marketing += costBRL;
          typeCounts.marketing += 1;
        } else if (dispatchType === "utility") {
          typeBreakdown.utility += costBRL;
          typeCounts.utility += 1;
        } else {
          typeBreakdown.service += costBRL;
          typeCounts.service += 1;
        }

        // Diário
        if (msgDate >= startOfDay) {
          daily += costBRL;
        }

        // Semanal
        if (msgDate >= startOfWeek) {
          weekly += costBRL;
        }
      });

      return {
        summary: {
          daily: Math.round(daily * 100) / 100,
          weekly: Math.round(weekly * 100) / 100,
          monthly: Math.round(monthly * 100) / 100,
          total: Math.round(total * 100) / 100,
        },
        byType: {
          marketing: Math.round(typeBreakdown.marketing * 100) / 100,
          utility: Math.round(typeBreakdown.utility * 100) / 100,
          service: Math.round(typeBreakdown.service * 100) / 100,
        },
        counts: typeCounts,
      };
    },
    enabled: !!user && !!effectiveOrganizationId,
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
  });

  return {
    summary: data?.summary ?? { daily: 0, weekly: 0, monthly: 0, total: 0 },
    byType: data?.byType ?? { marketing: 0, utility: 0, service: 0 },
    counts: data?.counts ?? { marketing: 0, utility: 0, service: 0 },
    loading: isLoading,
    refetch,
  };
}
