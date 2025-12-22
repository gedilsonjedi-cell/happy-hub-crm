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

interface DispatchCostsState {
  summary: DispatchCostSummary;
  byType: DispatchCostsByType;
  loading: boolean;
  refetch: () => void;
}

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

      // Fetch all costs for the user
      const { data, error } = await supabase
        .from("dispatch_costs")
        .select("total_cost, dispatch_type, dispatch_date")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching dispatch costs:", error);
        return;
      }

      if (!data || data.length === 0) {
        setSummary({ daily: 0, weekly: 0, monthly: 0, total: 0 });
        setByType({ marketing: 0, utility: 0, service: 0 });
        return;
      }

      let daily = 0;
      let weekly = 0;
      let monthly = 0;
      let total = 0;
      const typeBreakdown: DispatchCostsByType = { marketing: 0, utility: 0, service: 0 };

      data.forEach((cost) => {
        const costDate = new Date(cost.dispatch_date);
        const costValue = Number(cost.total_cost);
        
        total += costValue;
        
        // Add to type breakdown
        if (cost.dispatch_type === "marketing") {
          typeBreakdown.marketing += costValue;
        } else if (cost.dispatch_type === "utility") {
          typeBreakdown.utility += costValue;
        } else if (cost.dispatch_type === "service") {
          typeBreakdown.service += costValue;
        }

        // Daily
        if (costDate >= startOfDay) {
          daily += costValue;
        }

        // Weekly
        if (costDate >= startOfWeek) {
          weekly += costValue;
        }

        // Monthly
        if (costDate >= startOfMonth) {
          monthly += costValue;
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
    } catch (err) {
      console.error("Error fetching dispatch costs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
  }, [user]);

  return { summary, byType, loading, refetch: fetchCosts };
}
