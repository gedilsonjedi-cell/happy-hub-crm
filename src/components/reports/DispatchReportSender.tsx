import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { Phone, Send, Save, FileText, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USD_TO_BRL_RATE = 6.0;

interface DayData {
  totalDispatches: number;
  delivered: number;
  failed: number;
  totalCost: number;
  responses: number;
  blocks: number;
  restrictions: number; // broader: includes 131026, 131047, 131042, spam, restrict, rate limit
  marketing: { count: number; cost: number; delivered: number; failed: number };
  utility: { count: number; cost: number; delivered: number; failed: number };
  service: { count: number; cost: number; delivered: number; failed: number };
}

const emptyDay = (): DayData => ({
  totalDispatches: 0, delivered: 0, failed: 0, totalCost: 0, responses: 0, blocks: 0, restrictions: 0,
  marketing: { count: 0, cost: 0, delivered: 0, failed: 0 },
  utility: { count: 0, cost: 0, delivered: 0, failed: 0 },
  service: { count: 0, cost: 0, delivered: 0, failed: 0 },
});

const RESTRICTION_PATTERNS = ["block", "restrict", "spam", "rate", "131026", "131047", "131042", "3835016"];

const padMonthValue = (value: number) => String(value).padStart(2, "0");

const formatMonthInputValue = (date: Date) => `${date.getFullYear()}-${padMonthValue(date.getMonth() + 1)}`;

const getMonthRange = (monthValue: string) => {
  const now = new Date();
  const currentMonthValue = formatMonthInputValue(now);
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
  const monthStart = `${monthValue}-01T00:00:00.000Z`;
  const monthEndFull = `${lastDay}T23:59:59.999Z`;
  const isCurrentMonth = monthValue === currentMonthValue;

  return {
    isCurrentMonth,
    monthStart,
    monthEnd: isCurrentMonth ? now.toISOString() : monthEndFull,
    daysInMonth: Number(lastDay.split("-")[2]),
    daysElapsed: isCurrentMonth ? now.getDate() : Number(lastDay.split("-")[2]),
  };
};

export function DispatchReportSender() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [reportPhone, setReportPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => formatMonthInputValue(new Date()));
  const [dayData, setDayData] = useState<DayData>(emptyDay());
  const [prevDayData, setPrevDayData] = useState<DayData>(emptyDay());
  const [monthData, setMonthData] = useState<{ weeks: DayData[]; total: DayData }>({ weeks: [], total: emptyDay() });
  const [loadingData, setLoadingData] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const currentMonthStr = formatMonthInputValue(new Date());

  useEffect(() => {
    if (!effectiveOrganizationId) return;
    const fetchPhone = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("report_phone")
        .eq("id", effectiveOrganizationId)
        .single();
      if (data?.report_phone) setReportPhone(data.report_phone);
      setLoading(false);
    };
    fetchPhone();
  }, [effectiveOrganizationId]);

  const getChannelIds = useCallback(async () => {
    if (!effectiveOrganizationId) return [];
    const { data: channels } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", effectiveOrganizationId);
    return (channels || []).map(c => c.id);
  }, [effectiveOrganizationId]);

  const fetchDayMetrics = useCallback(async (date: string, channelIds: string[]): Promise<DayData> => {
    if (channelIds.length === 0) return emptyDay();
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;

    // Paginate to get ALL outbound and inbound messages for the day
    const PAGE_SIZE = 1000;
    const paginateQuery = async (direction: string, cols: string) => {
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase
          .from("whatsapp_messages")
          .select(cols)
          .in("channel_id", channelIds)
          .eq("direction", direction)
          .gte("created_at", start)
          .lte("created_at", end)
          .range(from, from + PAGE_SIZE - 1);
        const rows = data || [];
        all = all.concat(rows);
        hasMore = rows.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return all;
    };

    const [outbound, inbound] = await Promise.all([
      paginateQuery("outbound", "metadata, status"),
      paginateQuery("inbound", "id"),
    ]);

    const result = emptyDay();
    result.responses = inbound.length;

    outbound.forEach((msg: any) => {
      const metadata = msg.metadata as Record<string, unknown> | null;
      const costUSD = Number(metadata?.cost || 0);
      const costBRL = costUSD * USD_TO_BRL_RATE;
      const dispatchType = (metadata?.dispatch_type as string) || "service";
      const status = msg.status || "";

      const isDelivered = ["delivered", "read"].includes(status);
      const isFailed = ["failed", "error"].includes(status);
      const isBlocked = status === "failed" && (metadata?.error_code === "131026" || String(metadata?.error_message || "").toLowerCase().includes("block"));

      result.totalDispatches += 1;
      result.totalCost += costBRL;
      if (isDelivered) result.delivered += 1;
      if (isFailed) result.failed += 1;
      if (isBlocked) result.blocks += 1;

      const bucket = dispatchType === "marketing" ? result.marketing : dispatchType === "utility" ? result.utility : result.service;
      bucket.count += 1;
      bucket.cost += costBRL;
      if (isDelivered) bucket.delivered += 1;
      if (isFailed) bucket.failed += 1;
    });

    // Round costs
    result.totalCost = Math.round(result.totalCost * 100) / 100;
    result.marketing.cost = Math.round(result.marketing.cost * 100) / 100;
    result.utility.cost = Math.round(result.utility.cost * 100) / 100;
    result.service.cost = Math.round(result.service.cost * 100) / 100;

    return result;
  }, []);

  // Load daily data
  useEffect(() => {
    if (!effectiveOrganizationId || reportType !== "daily") return;
    const load = async () => {
      setLoadingData(true);
      const channelIds = await getChannelIds();

      // Previous day
      const prevDate = new Date(selectedDate + "T12:00:00");
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = prevDate.toISOString().split("T")[0];

      const [current, prev] = await Promise.all([
        fetchDayMetrics(selectedDate, channelIds),
        fetchDayMetrics(prevStr, channelIds),
      ]);

      setDayData(current);
      setPrevDayData(prev);
      setLoadingData(false);
    };
    load();
  }, [selectedDate, effectiveOrganizationId, reportType, getChannelIds, fetchDayMetrics]);

  // Load monthly data
  // Helper: paginate all rows from a query (bypasses 1000-row limit)
  const fetchAllRows = useCallback(async (
    table: "whatsapp_messages",
    channelIds: string[],
    direction: string,
    start: string,
    end: string,
    selectCols: string
  ) => {
    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from(table)
        .select(selectCols)
        .in("channel_id", channelIds)
        .eq("direction", direction)
        .gte("created_at", start)
        .lte("created_at", end)
        .range(from, from + PAGE_SIZE - 1);
      const rows = data || [];
      allRows = allRows.concat(rows);
      hasMore = rows.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    return allRows;
  }, []);

  // Load monthly data — uses campaigns table for totals + paginated messages for details
  useEffect(() => {
    if (!effectiveOrganizationId || reportType !== "monthly") return;
    const load = async () => {
      setLoadingData(true);
      const channelIds = await getChannelIds();
      const monthRange = getMonthRange(selectedMonth);
      const monthStartDate = new Date(monthRange.monthStart);
      const monthEndDate = new Date(monthRange.monthEnd);

      // 1) Get campaign-level totals — only completed/running campaigns (exclude paused, draft, failed)
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, total_recipients, sent_count, delivered_count, failed_count, created_at, status")
        .eq("organization_id", effectiveOrganizationId)
        .in("status", ["completed", "running"])
        .gte("created_at", monthRange.monthStart)
        .lte("created_at", monthRange.monthEnd);

      // 2) For accurate counts, fetch recipient-level data from campaign_recipients
      const campaignIds = (campaigns || []).map(c => c.id);
      let recipientDelivered = 0;
      let recipientFailed = 0;
      let recipientSent = 0;
      let recipientBlocks = 0;

      if (campaignIds.length > 0) {
        // Paginate campaign_recipients for all campaigns in the month
        const BATCH_SIZE = 50; // batch campaign IDs to avoid huge IN clauses
        for (let bi = 0; bi < campaignIds.length; bi += BATCH_SIZE) {
          const batchIds = campaignIds.slice(bi, bi + BATCH_SIZE);
          let from = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: recipients } = await supabase
              .from("campaign_recipients")
              .select("status, error_message, last_error_code")
              .in("campaign_id", batchIds)
              .range(from, from + 999);
            const rows = recipients || [];
            rows.forEach((r: any) => {
              const st = r.status || "";
              if (["sent", "delivered", "read", "clicked"].includes(st)) recipientSent += 1;
              if (["delivered", "read", "clicked"].includes(st)) recipientDelivered += 1;
              if (st === "failed") {
                recipientFailed += 1;
                const errMsg = String(r.error_message || r.last_error_code || "").toLowerCase();
                if (errMsg.includes("block") || errMsg.includes("restrict") || errMsg.includes("131026") || errMsg.includes("spam")) {
                  recipientBlocks += 1;
                }
              }
            });
            hasMore = rows.length === 1000;
            from += 1000;
          }
        }
      }

      const campaignTotals = {
        sent: recipientSent || (campaigns || []).reduce((s, c) => s + (c.sent_count ?? 0), 0),
        delivered: recipientDelivered || (campaigns || []).reduce((s, c) => s + (c.delivered_count ?? 0), 0),
        failed: recipientFailed || (campaigns || []).reduce((s, c) => s + (c.failed_count ?? 0), 0),
        recipients: (campaigns || []).reduce((s, c) => s + (c.total_recipients ?? 0), 0),
        blocks: recipientBlocks,
      };

      // 2) Paginate outbound messages for cost/type breakdown & inbound for responses
      const startISO = monthRange.monthStart;
      const endISO = monthRange.monthEnd;

      const [allOutbound, allInbound] = await Promise.all([
        fetchAllRows("whatsapp_messages", channelIds, "outbound", startISO, endISO, "metadata, status, created_at"),
        fetchAllRows("whatsapp_messages", channelIds, "inbound", startISO, endISO, "id, created_at"),
      ]);

      // 3) Build weekly breakdown from paginated data
      const weeks: DayData[] = [];
      const total = emptyDay();
      let weekStart = new Date(monthStartDate);

      while (weekStart.getTime() <= monthEndDate.getTime()) {
        let weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        if (weekEnd.getTime() > monthEndDate.getTime()) {
          weekEnd = new Date(monthEndDate);
        }

        const wStart = weekStart.getTime();
        const wEnd = weekEnd.getTime();

        const week = emptyDay();

        // Filter outbound for this week
        allOutbound.forEach((msg: any) => {
          const msgTime = new Date(msg.created_at).getTime();
          if (msgTime < wStart || msgTime > wEnd) return;
          const metadata = msg.metadata as Record<string, unknown> | null;
          const costBRL = Number(metadata?.cost || 0) * USD_TO_BRL_RATE;
          const status = msg.status || "";
          week.totalDispatches += 1;
          week.totalCost += costBRL;
          if (["delivered", "read"].includes(status)) week.delivered += 1;
          if (["failed", "error"].includes(status)) week.failed += 1;
          if (status === "failed" && String(metadata?.error_message || "").toLowerCase().includes("block")) week.blocks += 1;

          const dt = (metadata?.dispatch_type as string) || "service";
          const b = dt === "marketing" ? week.marketing : dt === "utility" ? week.utility : week.service;
          b.count += 1;
          b.cost += costBRL;
        });

        // Filter inbound for this week
        allInbound.forEach((msg: any) => {
          const msgTime = new Date(msg.created_at).getTime();
          if (msgTime >= wStart && msgTime <= wEnd) week.responses += 1;
        });

        week.totalCost = Math.round(week.totalCost * 100) / 100;
        weeks.push(week);

        total.delivered += week.delivered;
        total.failed += week.failed;
        total.totalCost += week.totalCost;
        total.responses += week.responses;
        total.blocks += week.blocks;
        total.marketing.count += week.marketing.count;
        total.marketing.cost += week.marketing.cost;
        total.utility.count += week.utility.count;
        total.utility.cost += week.utility.cost;
        total.service.count += week.service.count;
        total.service.cost += week.service.cost;

        weekStart = new Date(weekEnd);
        weekStart.setUTCDate(weekStart.getUTCDate() + 1);
      }

      // Use the HIGHER value between campaigns table and counted messages
      // This ensures we never undercount
      total.totalDispatches = Math.max(
        campaignTotals.sent,
        allOutbound.length
      );
      total.delivered = Math.max(campaignTotals.delivered, total.delivered);
      total.failed = Math.max(campaignTotals.failed, total.failed);
      total.blocks = Math.max(campaignTotals.blocks, total.blocks);

      total.totalCost = Math.round(total.totalCost * 100) / 100;
      total.marketing.cost = Math.round(total.marketing.cost * 100) / 100;
      total.utility.cost = Math.round(total.utility.cost * 100) / 100;
      total.service.cost = Math.round(total.service.cost * 100) / 100;

      setMonthData({ weeks, total });
      setLoadingData(false);
    };
    load();
  }, [effectiveOrganizationId, reportType, selectedMonth, getChannelIds, fetchAllRows]);

  const handleSavePhone = async () => {
    if (!effectiveOrganizationId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ report_phone: reportPhone } as any)
      .eq("id", effectiveOrganizationId);
    setSaving(false);
    error ? toast.error("Erro ao salvar número") : toast.success("Número salvo com sucesso!");
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (n: number, d: number) => d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`;
  const variation = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? "🔼 N/A (sem dados anteriores)" : "—";
    const diff = Math.round(((curr - prev) / prev) * 100);
    return diff > 0 ? `🔼 +${diff}%` : diff < 0 ? `🔻 ${diff}%` : "➡️ Estável";
  };

  const getQualityLabel = (blocks: number, total: number) => {
    if (total === 0) return { label: "Sem dados", emoji: "⚪" };
    const rate = blocks / total;
    if (rate <= 0.01) return { label: "Excelente", emoji: "🟢" };
    if (rate <= 0.03) return { label: "Boa", emoji: "🟡" };
    if (rate <= 0.07) return { label: "Média", emoji: "🟠" };
    return { label: "Baixa", emoji: "🔴" };
  };

  const generateInsight = (data: DayData, prev?: DayData) => {
    const lines: string[] = [];
    const responseRate = data.totalDispatches > 0 ? data.responses / data.totalDispatches : 0;
    const deliveryRate = data.totalDispatches > 0 ? data.delivered / data.totalDispatches : 0;
    const blockRate = data.totalDispatches > 0 ? data.blocks / data.totalDispatches : 0;

    if (prev && prev.totalDispatches > 0) {
      const prevResponseRate = prev.responses / prev.totalDispatches;
      if (responseRate > prevResponseRate + 0.05) {
        lines.push("📈 Taxa de resposta acima do dia anterior — sua comunicação está engajando bem!");
      } else if (responseRate < prevResponseRate - 0.05) {
        lines.push("📉 Queda na taxa de resposta — considere revisar o copy ou horário de envio.");
      }
    }

    if (deliveryRate >= 0.95) {
      lines.push("✅ Excelente taxa de entrega! Base saudável.");
    } else if (deliveryRate < 0.85 && data.totalDispatches > 10) {
      lines.push("⚠️ Taxa de entrega abaixo do ideal — verifique a qualidade da base de contatos.");
    }

    if (blockRate > 0.03 && data.totalDispatches > 10) {
      lines.push("🚨 Atenção: taxa de bloqueio elevada. Reduza o volume ou revise o conteúdo.");
    }

    if (responseRate >= 0.1 && data.totalDispatches > 10) {
      lines.push("💬 Boa taxa de engajamento! Leads estão interagindo com as mensagens.");
    } else if (responseRate < 0.03 && data.totalDispatches > 20) {
      lines.push("💡 Poucas respostas recebidas — experimente CTAs mais diretos ou templates interativos.");
    }

    if (lines.length === 0) {
      lines.push("📊 Operação estável. Continue monitorando os indicadores.");
    }

    return lines;
  };

  const selectedDateFormatted = new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR");

  const buildDailyReport = () => {
    const d = dayData;
    const q = getQualityLabel(d.blocks, d.totalDispatches);
    const costPerResponse = d.responses > 0 ? fmt(d.totalCost / d.responses) : "—";
    const insights = generateInsight(d, prevDayData);
    const prevDateFormatted = (() => {
      const p = new Date(selectedDate + "T12:00:00");
      p.setDate(p.getDate() - 1);
      return p.toLocaleDateString("pt-BR");
    })();

    return [
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *RELATÓRIO DIÁRIO DE DISPAROS*`,
      `📅 ${selectedDateFormatted}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📨 *VOLUME*`,
      `   Total de disparos: *${d.totalDispatches}*`,
      `   Entregues: *${d.delivered}*`,
      `   Falhas: *${d.failed}*`,
      ``,
      `📈 *PERFORMANCE*`,
      `   Taxa de entrega: *${pct(d.delivered, d.totalDispatches)}*`,
      `   Respostas recebidas: *${d.responses}*`,
      `   Taxa de resposta: *${pct(d.responses, d.totalDispatches)}*`,
      ``,
      `💰 *CUSTOS*`,
      `   Investimento do dia: *${fmt(d.totalCost)}*`,
      `   Custo por resposta: *${costPerResponse}*`,
      ``,
      `📋 *POR CATEGORIA*`,
      `   • Marketing: ${d.marketing.count} envios — ${fmt(d.marketing.cost)}`,
      `   • Utilidade: ${d.utility.count} envios — ${fmt(d.utility.cost)}`,
      `   • Serviço: ${d.service.count} envios — ${fmt(d.service.cost)}`,
      ``,
      `${q.emoji} *STATUS DA CONTA*`,
      `   Qualidade: *${q.label}*`,
      `   Bloqueios: *${d.blocks}*`,
      ...(d.blocks > 0 ? [`   ⚠️ _Atenção ao volume de bloqueios_`] : []),
      ``,
      `🔄 *COMPARATIVO (vs ${prevDateFormatted})*`,
      `   Disparos: ${variation(d.totalDispatches, prevDayData.totalDispatches)}`,
      `   Respostas: ${variation(d.responses, prevDayData.responses)}`,
      `   Entregues: ${variation(d.delivered, prevDayData.delivered)}`,
      ``,
      `💡 *INSIGHT*`,
      ...insights.map(i => `   ${i}`),
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `_Optimus CRM • Relatório automático_`,
    ].join("\n");
  };

  const buildMonthlyReport = () => {
    const t = monthData.total;
    const monthRange = getMonthRange(selectedMonth);
    const monthReference = new Date(`${selectedMonth}-01T12:00:00`);
    const monthStr = monthReference.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const daysInMonth = monthRange.daysInMonth;
    const daysPassed = monthRange.daysElapsed;
    const avgDaily = daysPassed > 0 ? Math.round(t.totalDispatches / daysPassed) : 0;
    const avgDailyResponses = daysPassed > 0 ? Math.round(t.responses / daysPassed) : 0;
    const q = getQualityLabel(t.blocks, t.totalDispatches);

    // Weekly evolution
    const weekLines = monthData.weeks.map((w, i) => {
      const weekLabel = `Semana ${i + 1}`;
      const trend = i > 0 ? variation(w.totalDispatches, monthData.weeks[i - 1].totalDispatches) : "";
      return `   ${weekLabel}: ${w.totalDispatches} envios | ${w.responses} respostas | ${pct(w.delivered, w.totalDispatches)} entrega ${trend}`;
    });

    // Monthly insights
    const insights: string[] = [];
    const responseRate = t.totalDispatches > 0 ? t.responses / t.totalDispatches : 0;
    const deliveryRate = t.totalDispatches > 0 ? t.delivered / t.totalDispatches : 0;
    const blockRate = t.totalDispatches > 0 ? t.blocks / t.totalDispatches : 0;

    if (deliveryRate >= 0.95) {
      insights.push("✅ Base de contatos saudável — taxa de entrega acima de 95%.");
    } else if (deliveryRate < 0.85) {
      insights.push("⚠️ Recomendação: higienize sua base de contatos para melhorar entregas.");
    }

    if (responseRate >= 0.08) {
      insights.push("💬 Engajamento positivo — leads estão interagindo ativamente.");
    } else if (responseRate < 0.03 && t.totalDispatches > 50) {
      insights.push("💡 Considere templates mais interativos (botões/listas) para aumentar respostas.");
    }

    if (blockRate > 0.03) {
      insights.push("🚨 Taxa de bloqueio alta. Reduza volume diário ou segmente melhor a base.");
    }

    if (monthData.weeks.length >= 2) {
      const lastWeek = monthData.weeks[monthData.weeks.length - 1];
      const prevWeek = monthData.weeks[monthData.weeks.length - 2];
      if (lastWeek.totalDispatches > prevWeek.totalDispatches * 1.2) {
        insights.push("📈 Volume crescente nas últimas semanas — monitore a qualidade da conta.");
      }
    }

    if (avgDaily > 0 && monthRange.isCurrentMonth) {
      const projection = avgDaily * daysInMonth;
      insights.push(`📊 Projeção para o mês: ~${projection} disparos | ~${fmt(t.totalCost / daysPassed * daysInMonth)} investimento.`);
    }

    if (insights.length === 0) {
      insights.push("📊 Métricas dentro do esperado. Continue monitorando.");
    }

    return [
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📅 *RELATÓRIO MENSAL DE PERFORMANCE*`,
      `🗓️ ${monthStr.charAt(0).toUpperCase() + monthStr.slice(1)}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📨 *RESUMO GERAL*`,
      `   Total de disparos: *${t.totalDispatches}*`,
      `   Entregues: *${t.delivered}*`,
      `   Respostas: *${t.responses}*`,
      `   Falhas: *${t.failed}*`,
      `   Média diária: *${avgDaily} envios / ${avgDailyResponses} respostas*`,
      ``,
      `📈 *PERFORMANCE*`,
      `   Taxa de entrega: *${pct(t.delivered, t.totalDispatches)}*`,
      `   Taxa de resposta: *${pct(t.responses, t.totalDispatches)}*`,
      `   Taxa de bloqueio: *${pct(t.blocks, t.totalDispatches)}*`,
      ``,
      `💰 *INVESTIMENTO*`,
      `   Total: *${fmt(t.totalCost)}*`,
      `   • Marketing: ${t.marketing.count} — ${fmt(t.marketing.cost)}`,
      `   • Utilidade: ${t.utility.count} — ${fmt(t.utility.cost)}`,
      `   • Serviço: ${t.service.count} — ${fmt(t.service.cost)}`,
      ``,
      `📊 *EVOLUÇÃO SEMANAL*`,
      ...weekLines,
      ``,
      `${q.emoji} *QUALIDADE DA BASE*`,
      `   Saúde da conta: *${q.label}*`,
      `   Bloqueios no mês: *${t.blocks}*`,
      `   Taxa de resposta geral: *${pct(t.responses, t.totalDispatches)}*`,
      ``,
      `💡 *INSIGHTS ESTRATÉGICOS*`,
      ...insights.map(i => `   ${i}`),
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `_Optimus CRM • Relatório automático_`,
    ].join("\n");
  };

  const handleSendReport = () => {
    const phone = reportPhone.replace(/\D/g, "");
    if (!phone) {
      toast.error("Cadastre um número de telefone primeiro");
      return;
    }
    const message = reportType === "daily" ? buildDailyReport() : buildMonthlyReport();
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Destinatário do Relatório
          </CardTitle>
          <CardDescription>
            Cadastre o número de WhatsApp que receberá os relatórios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="report-phone">Número do WhatsApp (com DDD e código do país)</Label>
              <Input
                id="report-phone"
                placeholder="5511999999999"
                value={reportPhone}
                onChange={(e) => setReportPhone(e.target.value)}
              />
            </div>
            <Button onClick={handleSavePhone} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Gerar Relatório
          </CardTitle>
          <CardDescription>
            Relatório profissional com performance, qualidade e insights automáticos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as "daily" | "monthly")}>
            <TabsList className="w-full">
              <TabsTrigger value="daily" className="flex-1 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Relatório Diário
              </TabsTrigger>
              <TabsTrigger value="monthly" className="flex-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Relatório Mensal
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {reportType === "daily" && (
            <div className="space-y-2">
              <Label htmlFor="report-date">Data do relatório</Label>
              <Input
                id="report-date"
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          )}

          {reportType === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="report-month">Mês do relatório</Label>
              <Input
                id="report-month"
                type="month"
                value={selectedMonth}
                max={currentMonthStr}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
          )}

          {loadingData ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Carregando métricas...</span>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono border border-border max-h-[500px] overflow-y-auto">
              {reportType === "daily" ? buildDailyReport() : buildMonthlyReport()}
            </div>
          )}

          <Button
            onClick={handleSendReport}
            className="w-full"
            variant="whatsapp"
            size="lg"
            disabled={!reportPhone || loadingData}
          >
            <Send className="w-5 h-5 mr-2" />
            Enviar Relatório via WhatsApp
          </Button>

          {!reportPhone && (
            <p className="text-sm text-destructive text-center">
              Cadastre um número acima para poder enviar o relatório
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
