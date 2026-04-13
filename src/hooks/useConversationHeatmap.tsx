import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
  date: string;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  maxCount: number;
  days: { dayOfWeek: number; date: string; label: string }[];
}

const DAY_LABELS = ["Domingo", "Segunda-Feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function useConversationHeatmap(daysBack = 7, buttonFilter?: string) {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      // Fetch buttons and heatmap data via server-side RPCs
      const [heatmapResult, buttonsResult] = await Promise.all([
        supabase.rpc("get_conversation_heatmap", {
          p_organization_id: effectiveOrganizationId,
          p_days_back: daysBack,
          p_button_filter: buttonFilter || null,
        }),
        supabase.rpc("get_available_buttons", {
          p_organization_id: effectiveOrganizationId,
          p_days_back: daysBack,
        }),
      ]);

      if (buttonsResult.data) {
        setAvailableButtons(
          (buttonsResult.data as { button_label: string; click_count: number }[])
            .map((b) => b.button_label)
        );
      }

      const rows = (heatmapResult.data || []) as { msg_date: string; msg_hour: number; msg_count: number; button_label: string | null }[];

      // Build day list for the range (using São Paulo timezone to match server)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setHours(0, 0, 0, 0);

      const daysList: { dayOfWeek: number; date: string; label: string }[] = [];
      for (let i = 0; i <= daysBack; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;
        daysList.push({
          dayOfWeek: d.getDay(),
          date: dateStr,
          label: DAY_LABELS[d.getDay()],
        });
      }

      // Aggregate rows by date/hour (sum across button labels for general view)
      const countMap = new Map<string, number>();
      rows.forEach((r) => {
        const key = `${r.msg_date}_${r.msg_hour}`;
        countMap.set(key, (countMap.get(key) || 0) + Number(r.msg_count));
      });

      let maxCount = 0;
      const cells: HeatmapCell[] = [];
      daysList.forEach((day, dayIdx) => {
        for (let h = 0; h < 24; h++) {
          const key = `${day.date}_${h}`;
          const count = countMap.get(key) || 0;
          if (count > maxCount) maxCount = count;
          cells.push({ day: dayIdx, hour: h, count, date: day.date });
        }
      });

      setData({ cells, maxCount, days: daysList });
    } catch (err) {
      console.error("Heatmap fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, daysBack, buttonFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, refetch: fetchData };
}
