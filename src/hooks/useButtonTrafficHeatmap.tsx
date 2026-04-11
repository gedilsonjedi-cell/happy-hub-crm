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
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setHours(0, 0, 0, 0);

      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels?.length) { setLoading(false); return; }
      const channelIds = channels.map(c => c.id);

      // Fetch inbound interactive messages (button clicks)
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("created_at, metadata, content, message_type")
        .in("channel_id", channelIds)
        .eq("direction", "inbound")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true })
        .limit(5000);

      if (!messages) { setLoading(false); return; }

      // Extract button interactions - check metadata and message_type for interactive/button responses
      const buttonMessages: { createdAt: string; buttonLabel: string }[] = [];
      const buttonSet = new Set<string>();

      messages.forEach(m => {
        const meta = m.metadata as Record<string, unknown> | null;
        let buttonLabel: string | null = null;

        // Check various patterns for button clicks
        if (meta) {
          if (meta.interactive_type === "button_reply" || meta.interactive_type === "button" || meta.type === "interactive") {
            buttonLabel = (meta.button_text || meta.title || meta.button_reply_title || "") as string;
          }
          if (meta.button_text) {
            buttonLabel = meta.button_text as string;
          }
          if (meta.interactive && typeof meta.interactive === "object") {
            const interactive = meta.interactive as Record<string, unknown>;
            if (interactive.button_reply && typeof interactive.button_reply === "object") {
              buttonLabel = (interactive.button_reply as Record<string, unknown>).title as string || null;
            }
          }
        }

        // Also check message_type for button responses
        if (!buttonLabel && (m.message_type === "button" || m.message_type === "interactive")) {
          buttonLabel = m.content || null;
        }

        if (buttonLabel && buttonLabel.trim()) {
          const label = buttonLabel.trim();
          buttonSet.add(label);
          buttonMessages.push({ createdAt: m.created_at, buttonLabel: label });
        }
      });

      setAvailableButtons(Array.from(buttonSet).sort());

      // Filter by selected button
      const filtered = selectedButton
        ? buttonMessages.filter(m => m.buttonLabel === selectedButton)
        : buttonMessages;

      // Build day list
      const daysList: { dayOfWeek: number; date: string; label: string }[] = [];
      for (let i = 0; i < daysBack; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        daysList.push({ dayOfWeek: d.getDay(), date: dateStr, label: DAY_LABELS[d.getDay()] });
      }

      // Count per day/hour
      const countMap = new Map<string, number>();
      filtered.forEach(m => {
        const d = new Date(m.createdAt);
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
      console.error("Button heatmap fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, daysBack, selectedButton]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, refetch: fetchData };
}
