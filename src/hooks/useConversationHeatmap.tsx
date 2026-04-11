import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

export interface HeatmapCell {
  day: number; // 0=Sun, 6=Sat
  hour: number; // 0-23
  count: number;
  date: string; // ISO date string for that day
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
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setHours(0, 0, 0, 0);

      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels?.length) { setLoading(false); return; }
      const channelIds = channels.map(c => c.id);

      let query = supabase
        .from("whatsapp_messages")
        .select("created_at, direction, metadata, content")
        .in("channel_id", channelIds)
        .eq("direction", "inbound")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true })
        .limit(5000);

      const { data: messages } = await query;
      if (!messages) { setLoading(false); return; }

      // Extract unique button labels from interactive responses
      const buttons = new Set<string>();
      messages.forEach(m => {
        const meta = m.metadata as Record<string, unknown> | null;
        if (meta?.interactive_type === "button" || meta?.type === "interactive") {
          const title = (meta.button_text || meta.title || "") as string;
          if (title) buttons.add(title);
        }
      });
      setAvailableButtons(Array.from(buttons).sort());

      // Filter by button if specified
      let filtered = messages;
      if (buttonFilter) {
        filtered = messages.filter(m => {
          const meta = m.metadata as Record<string, unknown> | null;
          const title = (meta?.button_text || meta?.title || "") as string;
          return title === buttonFilter;
        });
      }

      // Build day list for the range
      const daysList: { dayOfWeek: number; date: string; label: string }[] = [];
      for (let i = 0; i < daysBack; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        daysList.push({
          dayOfWeek: d.getDay(),
          date: dateStr,
          label: DAY_LABELS[d.getDay()],
        });
      }

      // Count messages per day/hour
      const countMap = new Map<string, number>();
      filtered.forEach(m => {
        const d = new Date(m.created_at);
        const dateStr = d.toISOString().split("T")[0];
        const hour = d.getHours();
        const key = `${dateStr}_${hour}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
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
