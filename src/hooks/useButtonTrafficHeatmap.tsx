import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import type { HeatmapData, HeatmapCell } from "./useConversationHeatmap";

const DAY_LABELS = ["Domingo", "Segunda-Feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function useButtonTrafficHeatmap(daysBack = 7, selectedButton?: string) {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      // First fetch available buttons
      const buttonsResult = await supabase.rpc("get_available_buttons", {
        p_organization_id: effectiveOrganizationId,
        p_days_back: daysBack,
      });

      const buttons = (buttonsResult.data as { button_label: string; click_count: number }[] || [])
        .map((b) => b.button_label);
      setAvailableButtons(buttons);

      let rows: { msg_date: string; msg_hour: number; msg_count: number; button_label: string | null }[];

      if (selectedButton) {
        // Fetch for a specific button
        const heatmapResult = await supabase.rpc("get_conversation_heatmap", {
          p_organization_id: effectiveOrganizationId,
          p_days_back: daysBack,
          p_button_filter: selectedButton,
        });
        rows = (heatmapResult.data || []) as typeof rows;
      } else {
        // "All buttons" — fetch each button individually and merge
        const results = await Promise.all(
          buttons.map((btn) =>
            supabase.rpc("get_conversation_heatmap", {
              p_organization_id: effectiveOrganizationId,
              p_days_back: daysBack,
              p_button_filter: btn,
            })
          )
        );
        rows = results.flatMap((r) => (r.data || []) as typeof rows);
      }

      const buttonRows = rows;

      // Build day list
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
        daysList.push({ dayOfWeek: d.getDay(), date: dateStr, label: DAY_LABELS[d.getDay()] });
      }

      // Count per day/hour
      const countMap = new Map<string, number>();
      buttonRows.forEach((r) => {
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
      console.error("Button heatmap fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, daysBack, selectedButton]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, refetch: fetchData };
}
