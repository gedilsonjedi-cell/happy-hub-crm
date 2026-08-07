import { useState, useEffect, useCallback, useRef } from "react";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import { getExternalClient } from "@/lib/externalSupabaseClient";
import { extractButtonLabel, type HeatmapData, type HeatmapCell } from "./useConversationHeatmap";
import { buildDays, toLocalDateHour, spCutoffIso } from "@/lib/heatmapTz";

interface RawMsg {
  created_at: string;
  sender_phone: string | null;
  message_type: string | null;
  content: string | null;
  metadata: any;
}

async function fetchInboundOnce(impersonatedOrgId: string | null, daysBack: number): Promise<RawMsg[]> {
  const ext = await getExternalClient(impersonatedOrgId);
  const cutoffIso = spCutoffIso(daysBack);
  const all: RawMsg[] = [];
  const pageSize = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: rows, error } = await ext
      .from("whatsapp_messages")
      .select("created_at, sender_phone, message_type, content, metadata")
      .eq("direction", "inbound")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (rows || []) as RawMsg[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 100000) break;
  }
  return all;
}

async function fetchInboundWithRetry(
  impersonatedOrgId: string | null,
  daysBack: number,
  attempts = 2
): Promise<RawMsg[]> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchInboundOnce(impersonatedOrgId, daysBack);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

export function useButtonTrafficHeatmap(daysBack = 7, selectedButton?: string) {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HeatmapData>({ cells: [], maxCount: 0, days: [] });
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const fetchData = useCallback(async (silent = false) => {
    if (!effectiveOrganizationId) return;
    if (!silent || !hasLoadedRef.current) setLoading(true);

    try {
      const all = await fetchInboundWithRetry(
        isImpersonating ? effectiveOrganizationId : null,
        daysBack
      );

      const withButton = all
        .map(m => ({ msg: m, label: extractButtonLabel(m) }))
        .filter(x => !!x.label) as { msg: RawMsg; label: string }[];

      const counts = new Map<string, number>();
      withButton.forEach(x => counts.set(x.label, (counts.get(x.label) || 0) + 1));
      setAvailableButtons(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([l]) => l));

      const days = buildDays(daysBack);

      const filtered = selectedButton
        ? withButton.filter(x => x.label === selectedButton)
        : withButton;

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
      setWarning(
        all.length === 0
          ? "Nenhuma mensagem recebida no período selecionado."
          : withButton.length === 0
          ? "Nenhuma interação de botão encontrada no período."
          : null
      );
    } catch (err) {
      console.error("Button heatmap fetch error:", err);
      setData({ cells: [], maxCount: 0, days: buildDays(daysBack) });
      setWarning(
        "Falha ao carregar dados da fonte externa. Tentaremos novamente automaticamente — verifique sua conexão se persistir."
      );
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [effectiveOrganizationId, isImpersonating, daysBack, selectedButton]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // refetch "ao vivo" silencioso: mantém o gráfico na tela durante a atualização
  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { loading, data, availableButtons, warning, refetch };

}
