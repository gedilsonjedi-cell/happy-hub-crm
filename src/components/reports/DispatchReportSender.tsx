import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { Phone, Send, Save, FileText, Calendar, TrendingUp, Loader2, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isNotWantedLabel } from "@/lib/notWantedButton";
import { fetchCampaignLinkClicks, sumClicks } from "@/lib/campaignLinkClicks";

const USD_TO_BRL_RATE = 6.0;

interface DayData {
  totalDispatches: number;
  delivered: number;
  failed: number;
  sent: number; // aceitas pela Meta (sent/delivered/read/clicked)
  refusals: number; // botão "Não Quero" (campaign_recipients.button_clicked)
  linkClicks: number; // link curto do "Consultar" com campanha de origem
  totalCost: number;
  responses: number;
  blocks: number;
  restrictions: number; // broader: includes 131026, 131047, 131042, spam, restrict, rate limit
  marketing: { count: number; cost: number; delivered: number; failed: number };
  utility: { count: number; cost: number; delivered: number; failed: number };
  service: { count: number; cost: number; delivered: number; failed: number };
}

const emptyDay = (): DayData => ({
  totalDispatches: 0, delivered: 0, failed: 0, sent: 0, refusals: 0, linkClicks: 0, totalCost: 0, responses: 0, blocks: 0, restrictions: 0,
  marketing: { count: 0, cost: 0, delivered: 0, failed: 0 },
  utility: { count: 0, cost: 0, delivered: 0, failed: 0 },
  service: { count: 0, cost: 0, delivered: 0, failed: 0 },
});

const RESTRICTION_PATTERNS = ["block", "restrict", "spam", "rate limit", "undeliverable", "locked", "131026", "131031", "131047", "131042", "131048", "3835016"];

const checkRestriction = (errorMessage: string | null, errorCode: string | null): boolean => {
  const combined = `${(errorMessage || "").toLowerCase()} ${(errorCode || "").toLowerCase()}`;
  return RESTRICTION_PATTERNS.some(p => combined.includes(p));
};

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
  const [weeklyData, setWeeklyData] = useState<{ days: DayData[]; total: DayData; prevWeekTotal: DayData }>({ days: [], total: emptyDay(), prevWeekTotal: emptyDay() });
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().split("T")[0];
  });
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
    const { data: channels } = await (supabase as any)
      .from("channels_public")
      .select("id")
      .eq("organization_id", effectiveOrganizationId);
    return (channels || []).map(c => c.id);
  }, [effectiveOrganizationId]);

  const fetchDayMetrics = useCallback(async (date: string, channelIds: string[]): Promise<DayData> => {
    if (!effectiveOrganizationId || channelIds.length === 0) return emptyDay();
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;

    // 1) Get campaigns for this org (all statuses that had actual sends)
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, unified_template_id")
      .eq("organization_id", effectiveOrganizationId);

    const campaignIds = (campaigns || []).map(c => c.id);

    // 2) Get template dispatch types for category breakdown
    const templateIds = [...new Set((campaigns || []).map(c => c.unified_template_id).filter(Boolean))];
    let templateTypeMap: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from("message_templates")
        .select("id, dispatch_type")
        .in("id", templateIds);
      (templates || []).forEach(t => { templateTypeMap[t.id] = t.dispatch_type || "service"; });
    }
    // Map campaign -> dispatch_type
    const campaignTypeMap: Record<string, string> = {};
    (campaigns || []).forEach(c => {
      campaignTypeMap[c.id] = c.unified_template_id ? (templateTypeMap[c.unified_template_id] || "service") : "service";
    });

    // 3) Paginate campaign_recipients by sent_at date
    const PAGE_SIZE = 1000;
    const result = emptyDay();

    if (campaignIds.length > 0) {
      const BATCH = 50;
      for (let bi = 0; bi < campaignIds.length; bi += BATCH) {
        const batchIds = campaignIds.slice(bi, bi + BATCH);
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: recipients } = await supabase
            .from("campaign_recipients")
            .select("campaign_id, status, error_message, last_error_code, button_clicked")
            .in("campaign_id", batchIds)
            .gte("sent_at", start)
            .lte("sent_at", end)
            .range(from, from + PAGE_SIZE - 1);
          const rows = recipients || [];
          rows.forEach((r: any) => {
            const st = r.status || "";
            const isDelivered = ["delivered", "read", "clicked"].includes(st);
            const isSent = ["sent", "delivered", "read", "clicked"].includes(st);
            const isFailed = st === "failed";
            const isRestriction = isFailed && checkRestriction(r.error_message, r.last_error_code);

            if (isSent || isFailed) result.totalDispatches += 1;
            if (isDelivered) result.delivered += 1;
            if (isSent) result.sent += 1;
            if (isNotWantedLabel(r.button_clicked)) result.refusals += 1;
            if (isFailed) result.failed += 1;
            if (isRestriction) { result.blocks += 1; result.restrictions += 1; }

            const dispatchType = campaignTypeMap[r.campaign_id] || "service";
            const bucket = dispatchType === "marketing" ? result.marketing : dispatchType === "utility" ? result.utility : result.service;
            if (isSent || isFailed) bucket.count += 1;
            if (isDelivered) bucket.delivered += 1;
            if (isFailed) bucket.failed += 1;
          });
          hasMore = rows.length === PAGE_SIZE;
          from += PAGE_SIZE;
        }
      }
    }

    // 4) Calculate costs from dispatch_pricing
    const { data: pricing } = await supabase.from("dispatch_pricing").select("dispatch_type, price_per_message");
    const priceMap: Record<string, number> = {};
    (pricing || []).forEach(p => { priceMap[p.dispatch_type] = Number(p.price_per_message); });

    result.marketing.cost = Math.round(result.marketing.count * (priceMap["marketing"] || 0) * USD_TO_BRL_RATE * 100) / 100;
    result.utility.cost = Math.round(result.utility.count * (priceMap["utility"] || 0) * USD_TO_BRL_RATE * 100) / 100;
    result.service.cost = Math.round(result.service.count * (priceMap["service"] || 0) * USD_TO_BRL_RATE * 100) / 100;
    result.totalCost = Math.round((result.marketing.cost + result.utility.cost + result.service.cost) * 100) / 100;

    // 5) Count inbound responses
    let inboundCount = 0;
    let inbFrom = 0;
    let inbMore = true;
    while (inbMore) {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .in("channel_id", channelIds)
        .eq("direction", "inbound")
        .gte("created_at", start)
        .lte("created_at", end)
        .range(inbFrom, inbFrom + PAGE_SIZE - 1);
      const rows = data || [];
      inboundCount += rows.length;
      inbMore = rows.length === PAGE_SIZE;
      inbFrom += PAGE_SIZE;
    }
    result.responses = inboundCount;
    result.linkClicks = sumClicks(await fetchCampaignLinkClicks(campaignIds, start, end));

    return result;
  }, [effectiveOrganizationId]);

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
  // Load weekly data
  useEffect(() => {
    if (!effectiveOrganizationId || reportType !== "weekly") return;
    const load = async () => {
      setLoadingData(true);
      const channelIds = await getChannelIds();
      const weekStartDate = new Date(selectedWeekStart + "T00:00:00");
      
      // Fetch each day of the week + previous week for comparison
      const dayPromises: Promise<DayData>[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        // Don't fetch future days
        if (d > new Date()) break;
        dayPromises.push(fetchDayMetrics(dateStr, channelIds));
      }

      // Previous week
      const prevWeekStart = new Date(weekStartDate);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevDayPromises: Promise<DayData>[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(prevWeekStart);
        d.setDate(d.getDate() + i);
        prevDayPromises.push(fetchDayMetrics(d.toISOString().split("T")[0], channelIds));
      }

      const [days, prevDays] = await Promise.all([
        Promise.all(dayPromises),
        Promise.all(prevDayPromises),
      ]);

      const sumDays = (arr: DayData[]): DayData => {
        const t = emptyDay();
        arr.forEach(d => {
          t.totalDispatches += d.totalDispatches;
          t.delivered += d.delivered;
          t.failed += d.failed;
          t.sent += d.sent;
          t.refusals += d.refusals;
          t.linkClicks += d.linkClicks;
          t.totalCost += d.totalCost;
          t.responses += d.responses;
          t.blocks += d.blocks;
          t.restrictions += d.restrictions;
          t.marketing.count += d.marketing.count;
          t.marketing.cost += d.marketing.cost;
          t.utility.count += d.utility.count;
          t.utility.cost += d.utility.cost;
          t.service.count += d.service.count;
          t.service.cost += d.service.cost;
        });
        t.totalCost = Math.round(t.totalCost * 100) / 100;
        return t;
      };

      setWeeklyData({ days, total: sumDays(days), prevWeekTotal: sumDays(prevDays) });
      setLoadingData(false);
    };
    load();
  }, [selectedWeekStart, effectiveOrganizationId, reportType, getChannelIds, fetchDayMetrics]);


  // Load monthly data — uses campaign_recipients.sent_at for accurate counts
  useEffect(() => {
    if (!effectiveOrganizationId || reportType !== "monthly") return;
    const load = async () => {
      setLoadingData(true);
      const channelIds = await getChannelIds();
      const monthRange = getMonthRange(selectedMonth);
      const monthStartDate = new Date(monthRange.monthStart);
      const monthEndDate = new Date(monthRange.monthEnd);
      const startISO = monthRange.monthStart;
      const endISO = monthRange.monthEnd;

      // 1) Get all campaigns for this org with their template types
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, unified_template_id")
        .eq("organization_id", effectiveOrganizationId);

      const campaignIds = (campaigns || []).map(c => c.id);

      // Get template dispatch types
      const templateIds = [...new Set((campaigns || []).map(c => c.unified_template_id).filter(Boolean))];
      let templateTypeMap: Record<string, string> = {};
      if (templateIds.length > 0) {
        const { data: templates } = await supabase
          .from("message_templates")
          .select("id, dispatch_type")
          .in("id", templateIds);
        (templates || []).forEach(t => { templateTypeMap[t.id] = t.dispatch_type || "service"; });
      }
      const campaignTypeMap: Record<string, string> = {};
      (campaigns || []).forEach(c => {
        campaignTypeMap[c.id] = c.unified_template_id ? (templateTypeMap[c.unified_template_id] || "service") : "service";
      });

      // 2) Fetch ALL campaign_recipients sent in this month (paginated)
      const PAGE_SIZE = 1000;
      interface RecipientRow { campaign_id: string; status: string; error_message: string | null; last_error_code: string | null; sent_at: string; }
      let allRecipients: RecipientRow[] = [];

      if (campaignIds.length > 0) {
        const BATCH = 50;
        for (let bi = 0; bi < campaignIds.length; bi += BATCH) {
          const batchIds = campaignIds.slice(bi, bi + BATCH);
          let from = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: recipients } = await supabase
              .from("campaign_recipients")
              .select("campaign_id, status, error_message, last_error_code, sent_at, button_clicked")
              .in("campaign_id", batchIds)
              .gte("sent_at", startISO)
              .lte("sent_at", endISO)
              .range(from, from + PAGE_SIZE - 1);
            const rows = (recipients || []) as any[];
            allRecipients = allRecipients.concat(rows);
            hasMore = rows.length === PAGE_SIZE;
            from += PAGE_SIZE;
          }
        }
      }

      // 3) Get pricing
      const { data: pricing } = await supabase.from("dispatch_pricing").select("dispatch_type, price_per_message");
      const priceMap: Record<string, number> = {};
      (pricing || []).forEach(p => { priceMap[p.dispatch_type] = Number(p.price_per_message); });

      // 4) Get inbound messages for response count
      let allInbound: { created_at: string }[] = [];
      let inbFrom = 0;
      let inbMore = true;
      while (inbMore) {
        const { data } = await supabase
          .from("whatsapp_messages")
          .select("created_at")
          .in("channel_id", channelIds)
          .eq("direction", "inbound")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .range(inbFrom, inbFrom + PAGE_SIZE - 1);
        const rows = (data || []) as any[];
        allInbound = allInbound.concat(rows);
        inbMore = rows.length === PAGE_SIZE;
        inbFrom += PAGE_SIZE;
      }

      // 5) Build weekly breakdown
      const weeks: DayData[] = [];
      const total = emptyDay();
      let weekStart = new Date(monthStartDate);

      while (weekStart.getTime() <= monthEndDate.getTime()) {
        let weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        if (weekEnd.getTime() > monthEndDate.getTime()) weekEnd = new Date(monthEndDate);

        const wStart = weekStart.getTime();
        const wEnd = weekEnd.getTime();
        const week = emptyDay();

        allRecipients.forEach((r: any) => {
          const sentTime = new Date(r.sent_at).getTime();
          if (sentTime < wStart || sentTime > wEnd) return;
          const st = r.status || "";
          const isSent = ["sent", "delivered", "read", "clicked"].includes(st);
          const isDelivered = ["delivered", "read", "clicked"].includes(st);
          const isFailed = st === "failed";
          const isRestriction = isFailed && checkRestriction(r.error_message, r.last_error_code);

          if (isSent || isFailed) week.totalDispatches += 1;
          if (isDelivered) week.delivered += 1;
          if (isSent) week.sent += 1;
          if (isNotWantedLabel(r.button_clicked)) week.refusals += 1;
          if (isFailed) week.failed += 1;
          if (isRestriction) { week.blocks += 1; week.restrictions += 1; }

          const dispatchType = campaignTypeMap[r.campaign_id] || "service";
          const bucket = dispatchType === "marketing" ? week.marketing : dispatchType === "utility" ? week.utility : week.service;
          if (isSent || isFailed) bucket.count += 1;
          if (isDelivered) bucket.delivered += 1;
          if (isFailed) bucket.failed += 1;
        });

        allInbound.forEach((msg: any) => {
          const msgTime = new Date(msg.created_at).getTime();
          if (msgTime >= wStart && msgTime <= wEnd) week.responses += 1;
        });

        week.linkClicks = sumClicks(await fetchCampaignLinkClicks(campaignIds, new Date(wStart).toISOString(), new Date(Math.min(wEnd + 86399999, monthEndDate.getTime())).toISOString()));

        // Calculate costs per category
        week.marketing.cost = Math.round(week.marketing.count * (priceMap["marketing"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.utility.cost = Math.round(week.utility.count * (priceMap["utility"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.service.cost = Math.round(week.service.count * (priceMap["service"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.totalCost = Math.round((week.marketing.cost + week.utility.cost + week.service.cost) * 100) / 100;

        weeks.push(week);

        total.totalDispatches += week.totalDispatches;
        total.delivered += week.delivered;
        total.failed += week.failed;
        total.sent += week.sent;
        total.refusals += week.refusals;
        total.linkClicks += week.linkClicks;
        total.totalCost += week.totalCost;
        total.responses += week.responses;
        total.blocks += week.blocks;
        total.restrictions += week.restrictions;
        total.marketing.count += week.marketing.count;
        total.marketing.cost += week.marketing.cost;
        total.utility.count += week.utility.count;
        total.utility.cost += week.utility.cost;
        total.service.count += week.service.count;
        total.service.cost += week.service.cost;

        weekStart = new Date(weekEnd);
        weekStart.setUTCDate(weekStart.getUTCDate() + 1);
      }

      total.totalCost = Math.round(total.totalCost * 100) / 100;
      total.marketing.cost = Math.round(total.marketing.cost * 100) / 100;
      total.utility.cost = Math.round(total.utility.cost * 100) / 100;
      total.service.cost = Math.round(total.service.cost * 100) / 100;

      setMonthData({ weeks, total });
      setLoadingData(false);
    };
    load();
  }, [effectiveOrganizationId, reportType, selectedMonth, getChannelIds]);

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
    if (prev === 0) return curr > 0 ? "+N/A" : "—";
    const diff = Math.round(((curr - prev) / prev) * 100);
    return diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "Estavel";
  };

  // Saúde da base = sucesso de envio (Enviadas / Destinatários processados).
  // Falhas não aparecem aqui: muitas vêm de erros da própria Meta.
  const getQualityLabel = (data: DayData) => {
    const { sent, totalDispatches } = data;
    if (totalDispatches === 0) return { label: "Sem dados", emoji: "", detail: "Nenhum disparo registrado" };
    const rate = Math.round((sent / totalDispatches) * 100);
    const detail = `Sucesso de envio ${rate}% (${sent} de ${totalDispatches})`;
    if (rate >= 95) return { label: "Excelente", emoji: "", detail };
    if (rate >= 85) return { label: "Boa", emoji: "", detail };
    if (rate >= 70) return { label: "Moderada", emoji: "", detail };
    return { label: "Baixa", emoji: "", detail };
  };

  const rateLines = (d: DayData) => [
    `Taxa de sucesso (enviadas): *${pct(d.sent, d.totalDispatches)}*`,
    `Taxa de entrega (entregues/enviadas): *${pct(d.delivered, d.sent)}*`,
    `Cliques em link (Consultar): *${d.linkClicks}* (${pct(d.linkClicks, d.delivered)} das entregues)`,
    `Recusas (Nao Quero): *${d.refusals}* (${pct(d.refusals, d.delivered)} das entregues)`,
    `_Cliques em link por campanha contam a partir de 01/10/2026._`,
  ];

  const generateInsight = (data: DayData, prev?: DayData) => {
    const lines: string[] = [];
    const responseRate = data.totalDispatches > 0 ? data.responses / data.totalDispatches : 0;
    const deliveryRate = data.sent > 0 ? data.delivered / data.sent : 0;
    const blockRate = data.totalDispatches > 0 ? data.blocks / data.totalDispatches : 0;

    if (prev && prev.totalDispatches > 0) {
      const prevResponseRate = prev.responses / prev.totalDispatches;
      if (responseRate > prevResponseRate + 0.05) {
        lines.push("Taxa de resposta acima do dia anterior. Sua comunicacao esta engajando bem!");
      } else if (responseRate < prevResponseRate - 0.05) {
        lines.push("Queda na taxa de resposta. Considere revisar o copy ou horario de envio.");
      }
    }

    if (deliveryRate >= 0.95) {
      lines.push("Excelente taxa de entrega! Base saudavel.");
    } else if (deliveryRate < 0.85 && data.totalDispatches > 10) {
      lines.push("Taxa de entrega abaixo do ideal. Verifique a qualidade da base de contatos.");
    }

    if (blockRate > 0.03 && data.totalDispatches > 10) {
      lines.push("Atencao: taxa de bloqueio elevada. Reduza o volume ou revise o conteudo.");
    }

    if (responseRate >= 0.1 && data.totalDispatches > 10) {
      lines.push("Boa taxa de engajamento! Leads estao interagindo com as mensagens.");
    } else if (responseRate < 0.03 && data.totalDispatches > 20) {
      lines.push("Poucas respostas recebidas. Experimente CTAs mais diretos ou templates interativos.");
    }

    if (lines.length === 0) {
      lines.push("Operacao estavel. Continue monitorando os indicadores.");
    }

    return lines;
  };

  const selectedDateFormatted = new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR");

  const buildDailyReport = () => {
    const d = dayData;
    const q = getQualityLabel(d);
    const insights = generateInsight(d, prevDayData);
    const engagementRate = pct(d.responses, d.totalDispatches);

    return [
      `*RELATORIO DIARIO*`,
      `${selectedDateFormatted}`,
      ``,
      `*ENVIOS*`,
      `Destinatarios processados: *${d.totalDispatches}*`,
      `Enviadas: *${d.sent}*`,
      `Entregues: *${d.delivered}*`,
      `Respostas: *${d.responses}*`,
      `Engajamento: *${engagementRate}*`,
      ``,
      `*PERFORMANCE*`,
      ...rateLines(d),
      ``,
      `*SAUDE DA BASE*`,
      `Status: *${q.label}*`,
      `${q.detail}`,
      ``,
      `*INSIGHTS*`,
      ...insights,
      ``,
      `_Optimus CRM_`,
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
    const q = getQualityLabel(t);

    // Weekly evolution
    const weekLines = monthData.weeks.map((w, i) => {
      const weekLabel = `Semana ${i + 1}`;
      const trend = i > 0 ? variation(w.totalDispatches, monthData.weeks[i - 1].totalDispatches) : "";
      return `${weekLabel}: ${w.totalDispatches} envios | ${w.responses} respostas | ${pct(w.sent, w.totalDispatches)} sucesso ${trend}`.trim();
    });

    // Monthly insights
    const insights: string[] = [];
    const responseRate = t.totalDispatches > 0 ? t.responses / t.totalDispatches : 0;
    const deliveryRate = t.sent > 0 ? t.delivered / t.sent : 0;
    const blockRate = t.totalDispatches > 0 ? t.blocks / t.totalDispatches : 0;

    if (deliveryRate >= 0.95) {
      insights.push("Base de contatos saudavel. Taxa de entrega acima de 95%.");
    } else if (deliveryRate < 0.85) {
      insights.push("Recomendacao: higienize sua base de contatos para melhorar entregas.");
    }

    if (responseRate >= 0.08) {
      insights.push("Engajamento positivo. Leads estao interagindo ativamente.");
    } else if (responseRate < 0.03 && t.totalDispatches > 50) {
      insights.push("Considere templates mais interativos (botoes/listas) para aumentar respostas.");
    }

    if (blockRate > 0.03) {
      insights.push("Taxa de bloqueio alta. Reduza volume diario ou segmente melhor a base.");
    }

    if (monthData.weeks.length >= 2) {
      const lastWeek = monthData.weeks[monthData.weeks.length - 1];
      const prevWeek = monthData.weeks[monthData.weeks.length - 2];
      if (lastWeek.totalDispatches > prevWeek.totalDispatches * 1.2) {
        insights.push("Volume crescente nas ultimas semanas. Monitore a qualidade da conta.");
      }
    }

    if (avgDaily > 0 && monthRange.isCurrentMonth) {
      const projection = avgDaily * daysInMonth;
      insights.push(`Projecao para o mes: ~${projection} disparos.`);
    }

    if (insights.length === 0) {
      insights.push("Metricas dentro do esperado. Continue monitorando.");
    }

    return [
      `*RELATORIO MENSAL*`,
      `${monthStr.charAt(0).toUpperCase() + monthStr.slice(1)}`,
      ``,
      `*RESUMO GERAL*`,
      `Total de disparos: *${t.totalDispatches}*`,
      `Enviadas: *${t.sent}*`,
      `Entregues: *${t.delivered}*`,
      `Respostas: *${t.responses}*`,
      `Falhas: *${t.failed}*`,
      `Media diaria: *${avgDaily} envios / ${avgDailyResponses} respostas*`,
      ``,
      `*PERFORMANCE*`,
      ...rateLines(t),
      `Taxa de resposta: *${pct(t.responses, t.totalDispatches)}*`,
      ``,
      `*EVOLUCAO SEMANAL*`,
      ...weekLines,
      ``,
      `*SAUDE DA CONTA*`,
      `Status: *${q.label}*`,
      `${q.detail}`,
      ``,
      `*INSIGHTS*`,
      ...insights,
      ``,
      `_Optimus CRM_`,
    ].join("\n");
  };

  const buildWeeklyReport = () => {
    const t = weeklyData.total;
    const prev = weeklyData.prevWeekTotal;
    const q = getQualityLabel(t);
    const weekStartDate = new Date(selectedWeekStart + "T12:00:00");
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekLabel = `${weekStartDate.toLocaleDateString("pt-BR")} a ${weekEndDate.toLocaleDateString("pt-BR")}`;
    const insights = generateInsight(t);

    // Day-by-day breakdown
    const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const dayLines = weeklyData.days.map((d, i) => {
      const dayDate = new Date(weekStartDate);
      dayDate.setDate(dayDate.getDate() + i);
      return `${dayNames[i]} ${dayDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: ${d.totalDispatches} envios | ${d.sent} enviadas | ${d.delivered} entregues | ${d.responses} respostas${d.restrictions > 0 ? ` | ${d.restrictions} restricoes` : ""}`;
    });

    // Best/worst day
    let bestDay = 0, worstDay = 0;
    weeklyData.days.forEach((d, i) => {
      if (d.responses > weeklyData.days[bestDay].responses) bestDay = i;
      if (d.totalDispatches > 0 && (weeklyData.days[worstDay].totalDispatches === 0 || d.sent / d.totalDispatches < weeklyData.days[worstDay].sent / weeklyData.days[worstDay].totalDispatches)) worstDay = i;
    });

    return [
      `*RELATORIO SEMANAL*`,
      `${weekLabel}`,
      ``,
      `*RESUMO DA SEMANA*`,
      `Total de disparos: *${t.totalDispatches}*`,
      `Enviadas: *${t.sent}*`,
      `Entregues: *${t.delivered}*`,
      `Respostas: *${t.responses}*`,
      `Falhas: *${t.failed}*`,
      ``,
      `*PERFORMANCE*`,
      ...rateLines(t),
      `Taxa de resposta: *${pct(t.responses, t.totalDispatches)}*`,
      ``,
      `*DETALHAMENTO DIARIO*`,
      ...dayLines,
      ``,
      ...(weeklyData.days.length > 1 ? [
        `*DESTAQUES*`,
        `Melhor dia: *${dayNames[bestDay]}* - ${weeklyData.days[bestDay].responses} respostas`,
        `Menor sucesso de envio: *${dayNames[worstDay]}* - ${pct(weeklyData.days[worstDay].sent, weeklyData.days[worstDay].totalDispatches)}`,
        ``,
      ] : []),
      `*VS SEMANA ANTERIOR*`,
      `Disparos: ${variation(t.totalDispatches, prev.totalDispatches)}`,
      `Respostas: ${variation(t.responses, prev.responses)}`,
      `Entregues: ${variation(t.delivered, prev.delivered)}`,
      `Falhas: ${variation(t.failed, prev.failed)}`,
      ``,
      `*SAUDE DA CONTA*`,
      `Status: *${q.label}*`,
      `${q.detail}`,
      ``,
      `*INSIGHTS*`,
      ...insights,
      ``,
      `_Optimus CRM_`,
    ].join("\n");
  };

  const handleSendReport = () => {
    const phone = reportPhone.replace(/\D/g, "");
    if (!phone) {
      toast.error("Cadastre um número de telefone primeiro");
      return;
    }
    const message = reportType === "daily" ? buildDailyReport() : reportType === "weekly" ? buildWeeklyReport() : buildMonthlyReport();
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
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as "daily" | "weekly" | "monthly")}>
            <TabsList className="w-full">
              <TabsTrigger value="daily" className="flex-1 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Diário
              </TabsTrigger>
              <TabsTrigger value="weekly" className="flex-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Semanal
              </TabsTrigger>
              <TabsTrigger value="monthly" className="flex-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Mensal
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

          {reportType === "weekly" && (
            <div className="space-y-2">
              <Label htmlFor="report-week">Início da semana (segunda-feira)</Label>
              <Input
                id="report-week"
                type="date"
                value={selectedWeekStart}
                max={todayStr}
                onChange={(e) => {
                  // Snap to Monday
                  const d = new Date(e.target.value + "T12:00:00");
                  const day = d.getDay();
                  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
                  setSelectedWeekStart(d.toISOString().split("T")[0]);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Semana de {new Date(selectedWeekStart + "T12:00:00").toLocaleDateString("pt-BR")} a {(() => {
                  const end = new Date(selectedWeekStart + "T12:00:00");
                  end.setDate(end.getDate() + 6);
                  return end.toLocaleDateString("pt-BR");
                })()}
              </p>
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
              {reportType === "daily" ? buildDailyReport() : reportType === "weekly" ? buildWeeklyReport() : buildMonthlyReport()}
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
