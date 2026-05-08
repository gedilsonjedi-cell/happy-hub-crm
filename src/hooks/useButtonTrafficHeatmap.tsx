import { useState, useEffect, useCallback } from "react";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import { getExternalClient } from "@/lib/externalSupabaseClient";
import { extractButtonLabel, type HeatmapData, type HeatmapCell } from "./useConversationHeatmap";

const DAY_LABELS = ["Domingo", "Segunda-Feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const TZ = "America/Sao_Paulo";

interface RawMsg {
  created_at: string;
  sender_phone: string | null;
  message_type: string | null;
  content: string | null;
  metadata: any;
}

function toLocalDateHour(iso: string): { date: string; hour: number } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
  };
}

function buildDays(daysBack: number) {
  const start = new Date();
  start.setDate(start.getDate() - (daysBack - 1));
  start.setHours(0, 0, 0, 0);
  const days: { dayOfWeek: number; date: string; label: string }[] = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ dayOfWeek: d.getDay(), date: dateStr, label: DAY_LABELS[d.getDay()] });
  }
  return days;
}

export function useButtonTrafficHeatmap(daysBack = 7, selectedButton?: string) {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      const ext = await getExternalClient(isImpersonating ? effectiveOrganizationId : null);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      cutoff.setHours(0, 0, 0, 0);

      // Fetch only messages that are likely button interactions to keep payload smaller
      const all: RawMsg[] = [];
      const pageSize = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: rows, error } = await ext
          .from("whatsapp_messages")
          .select("created_at, sender_phone, message_type, content, metadata")
          .eq("direction", "inbound")
          .gte("created_at", cutoff.toISOString())
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (rows || []) as RawMsg[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        if (from > 100000) break;
      }

      // Only messages with detectable button label
      const withButton = all
        .map(m => ({ msg: m, label: extractButtonLabel(m) }))
        .filter(x => !!x.label) as { msg: RawMsg; label: string }[];

      // Available buttons (sorted by frequency)
      const counts = new Map<string, number>();
      withButton.forEach(x => counts.set(x.label, (counts.get(x.label) || 0) + 1));
      setAvailableButtons(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([l]) => l));

      const days = buildDays(daysBack);

      const filtered = selectedButton
        ? withButton.filter(x => x.label === selectedButton)
        : withButton;

      // distinct phone per (date, hour)
      const distinctSet = new Map<string, Set<string>>();
      filtered.forEach(({ msg }) => {
        if (!msg.sender_phone) return;
        const { date, hour } = toLocalDateHour(msg.created_at);
        const key = `${date}_${hour}`;
        if (!distinctSet.has(key)) distinctSet.set(key, new Set());
        distinctSet.get(key)!.add(msg.sender_phone);
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
      console.error("Button heatmap fetch error:", err);
      setData({ cells: [], maxCount: 0, days: buildDays(daysBack) });
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, isImpersonating, daysBack, selectedButton]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, refetch: fetchData };
}
