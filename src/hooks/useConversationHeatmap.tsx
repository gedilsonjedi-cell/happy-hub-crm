import { useState, useEffect, useCallback } from "react";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import { getExternalClient } from "@/lib/externalSupabaseClient";
import { buildDays, toLocalDateHour, spCutoffIso } from "@/lib/heatmapTz";

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

interface RawMsg {
  created_at: string;
  sender_phone: string | null;
  message_type: string | null;
  content: string | null;
  metadata: any;
}

export function extractButtonLabel(m: RawMsg): string | null {
  const md = m.metadata || {};
  return (
    md.button_text ||
    md.title ||
    md?.interactive?.button_reply?.title ||
    (m.message_type === "button" || m.message_type === "interactive" ? m.content || null : null) ||
    null
  );
}

// Fetch inbound messages from EXTERNAL DB for the given date range
async function fetchInboundMessages(
  impersonatedOrgId: string | null,
  daysBack: number
): Promise<RawMsg[]> {
  const ext = await getExternalClient(impersonatedOrgId);
  const cutoffIso = spCutoffIso(daysBack);

  const all: RawMsg[] = [];
  const pageSize = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await ext
      .from("whatsapp_messages")
      .select("created_at, sender_phone, message_type, content, metadata")
      .eq("direction", "inbound")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as RawMsg[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 100000) break; // sanity guard
  }
  return all;
}

export function useConversationHeatmap(daysBack = 7, buttonFilter?: string) {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      const messages = await fetchInboundMessages(
        isImpersonating ? effectiveOrganizationId : null,
        daysBack
      );

      // Available buttons (last N days)
      const buttonCounts = new Map<string, number>();
      messages.forEach(m => {
        const lbl = extractButtonLabel(m);
        if (lbl) buttonCounts.set(lbl, (buttonCounts.get(lbl) || 0) + 1);
      });
      setAvailableButtons(
        Array.from(buttonCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([l]) => l)
      );

      const days = buildDays(daysBack);

      // Apply button filter when provided
      const filtered = buttonFilter
        ? messages.filter(m => extractButtonLabel(m) === buttonFilter)
        : messages;

      // Distinct sender_phone per (date, hour) — matches original RPC behavior
      const distinctSet = new Map<string, Set<string>>();
      filtered.forEach(m => {
        if (!m.sender_phone) return;
        const { date, hour } = toLocalDateHour(m.created_at);
        const key = `${date}_${hour}`;
        if (!distinctSet.has(key)) distinctSet.set(key, new Set());
        distinctSet.get(key)!.add(m.sender_phone);
      });

      let maxCount = 0;
      const cells: HeatmapCell[] = [];
      days.forEach((day, dayIdx) => {
        for (let h = 0; h < 24; h++) {
          const count = distinctSet.get(`${day.date}_${h}`)?.size || 0;
          if (count > maxCount) maxCount = count;
          cells.push({ day: dayIdx, hour: h, count, date: day.date });
        }
      });

      setData({ cells, maxCount, days });
    } catch (err) {
      console.error("Heatmap fetch error:", err);
      setData({ cells: [], maxCount: 0, days: buildDays(daysBack) });
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, isImpersonating, daysBack, buttonFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, refetch: fetchData };
}
