import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DispatchCostSummary {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
}

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

interface DispatchCostsState {
  summary: DispatchCostSummary;
  byType: DispatchCostsByType;
  counts: DispatchCountsByType;
  loading: boolean;
  refetch: () => void;
}

// Taxa de conversão USD para BRL (você pode ajustar ou buscar dinamicamente)
const USD_TO_BRL_RATE = 6.0;

export function useDispatchCosts(): DispatchCostsState {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DispatchCostSummary>({
    daily: 0,
    weekly: 0,
    monthly: 0,
    total: 0,
  });
  const [byType, setByType] = useState<DispatchCostsByType>({
    marketing: 0,
    utility: 0,
    service: 0,
  });
  const [counts, setCounts] = useState<DispatchCountsByType>({
    marketing: 0,
    utility: 0,
    service: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchCosts = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Buscar mensagens enviadas com sucesso (entregues via Meta)
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("metadata, created_at")
        .eq("direction", "outbound")
        .in("status", ["delivered", "sent", "read"]);

      if (error) {
        console.error("Error fetching dispatch data:", error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setSummary({ daily: 0, weekly: 0, monthly: 0, total: 0 });
        setByType({ marketing: 0, utility: 0, service: 0 });
        setCounts({ marketing: 0, utility: 0, service: 0 });
        setLoading(false);
        return;
      }

      let daily = 0;
      let weekly = 0;
      let monthly = 0;
      let total = 0;
      const typeBreakdown: DispatchCostsByType = { marketing: 0, utility: 0, service: 0 };
      const typeCounts: DispatchCountsByType = { marketing: 0, utility: 0, service: 0 };

      data.forEach((msg) => {
        const metadata = msg.metadata as Record<string, unknown> | null;
        if (!metadata) return;

        const costUSD = Number(metadata.cost || 0);
        const costBRL = costUSD * USD_TO_BRL_RATE;
        const dispatchType = (metadata.dispatch_type as string) || "service";
        const msgDate = new Date(msg.created_at);

        total += costBRL;

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

        // Mensal
        if (msgDate >= startOfMonth) {
          monthly += costBRL;
        }
      });

      setSummary({
        daily: Math.round(daily * 100) / 100,
        weekly: Math.round(weekly * 100) / 100,
        monthly: Math.round(monthly * 100) / 100,
        total: Math.round(total * 100) / 100,
      });
      setByType({
        marketing: Math.round(typeBreakdown.marketing * 100) / 100,
        utility: Math.round(typeBreakdown.utility * 100) / 100,
        service: Math.round(typeBreakdown.service * 100) / 100,
      });
      setCounts(typeCounts);
    } catch (err) {
      console.error("Error fetching dispatch costs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
  }, [user]);

  return { summary, byType, counts, loading, refetch: fetchCosts };
}
