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
async function fetchInboundMessagesOnce(
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

// Retry wrapper: tries up to `attempts` times with short backoff before giving up.
async function fetchInboundMessages(
  impersonatedOrgId: string | null,
  daysBack: number,
  attempts = 2
): Promise<RawMsg[]> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchInboundMessagesOnce(impersonatedOrgId, daysBack);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export function useConversationHeatmap(daysBack = 7, buttonFilter?: string) {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      const messages = await fetchInboundMessages(
        isImpersonating ? effectiveOrganizationId : null,
        daysBack
      );

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

      const filtered = buttonFilter
        ? messages.filter(m => extractButtonLabel(m) === buttonFilter)
        : messages;

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
      setWarning(messages.length === 0
        ? "Nenhuma mensagem recebida no período selecionado."
        : null);
    } catch (err: any) {
      console.error("Heatmap fetch error:", err);
      setData({ cells: [], maxCount: 0, days: buildDays(daysBack) });
      setWarning(
        "Falha ao carregar dados da fonte externa. Tentaremos novamente automaticamente — verifique sua conexão se persistir."
      );
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, isImpersonating, daysBack, buttonFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, availableButtons, warning, refetch: fetchData };
}
