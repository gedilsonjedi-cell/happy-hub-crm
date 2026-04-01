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
    const { data: channels } = await supabase
      .from("channels")
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
            .select("campaign_id, status, error_message, last_error_code")
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
              .select("campaign_id, status, error_message, last_error_code, sent_at")
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

        // Calculate costs per category
        week.marketing.cost = Math.round(week.marketing.count * (priceMap["marketing"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.utility.cost = Math.round(week.utility.count * (priceMap["utility"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.service.cost = Math.round(week.service.count * (priceMap["service"] || 0) * USD_TO_BRL_RATE * 100) / 100;
        week.totalCost = Math.round((week.marketing.cost + week.utility.cost + week.service.cost) * 100) / 100;

        weeks.push(week);

        total.totalDispatches += week.totalDispatches;
        total.delivered += week.delivered;
        total.failed += week.failed;
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
    if (prev === 0) return curr > 0 ? "🔼 N/A (sem dados anteriores)" : "—";
    const diff = Math.round(((curr - prev) / prev) * 100);
    return diff > 0 ? `🔼 +${diff}%` : diff < 0 ? `🔻 ${diff}%` : "➡️ Estável";
  };

  const getQualityLabel = (data: DayData) => {
    const { blocks, restrictions, failed, totalDispatches, delivered } = data;
    if (totalDispatches === 0) return { label: "Sem dados", emoji: "⚪", detail: "Nenhum disparo registrado" };
    
    const restrictionRate = (restrictions || blocks) / totalDispatches;
    const failureRate = failed / totalDispatches;
    const deliveryRate = delivered / totalDispatches;
    
    // Use the worst indicator to determine quality
    if (restrictionRate > 0.05 || failureRate > 0.15) {
      return { label: "Crítica", emoji: "🔴", detail: `${Math.round(failureRate * 100)}% de falha | ${restrictions || blocks} restrições detectadas` };
    }
    if (restrictionRate > 0.03 || failureRate > 0.10) {
      return { label: "Baixa", emoji: "🟠", detail: `${Math.round(failureRate * 100)}% de falha | ${restrictions || blocks} restrições` };
    }
    if (restrictionRate > 0.01 || failureRate > 0.05) {
      return { label: "Moderada", emoji: "🟡", detail: `Taxa de entrega ${Math.round(deliveryRate * 100)}% | Monitorar restrições` };
    }
    return { label: "Excelente", emoji: "🟢", detail: `Taxa de entrega ${Math.round(deliveryRate * 100)}% | Base saudável` };
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
    const q = getQualityLabel(d);
    const insights = generateInsight(d, prevDayData);
    const engagementRate = pct(d.responses, d.totalDispatches);

    // Count clicks (status "clicked")
    // clicks are already included in delivered count logic, but we need a separate count
    // For now, clicks = responses as proxy (users who interacted)
    const clickCount = d.responses;

    return [
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *RELATÓRIO DIÁRIO*`,
      `📅 ${selectedDateFormatted}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📨 *Total de disparos:* ${d.totalDispatches}`,
      `👆 *Clicks/Respostas:* ${clickCount}`,
      `📈 *Taxa de engajamento:* ${engagementRate}`,
      ``,
      `${q.emoji} *PERFORMANCE DA BASE*`,
      `   Status: *${q.label}*`,
      `   ${q.detail}`,
      ...(d.restrictions > 0 || d.blocks > 0 ? [`   ⚠️ ${d.restrictions || d.blocks} restrições detectadas`] : []),
      ``,
      `💡 *INSIGHTS*`,
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
    const q = getQualityLabel(t);

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
      `   Taxa de restrições: *${pct(t.restrictions || t.blocks, t.totalDispatches)}*`,
      `   Taxa de falha total: *${pct(t.failed, t.totalDispatches)}*`,
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
      `${q.emoji} *SAÚDE DA CONTA*`,
      `   Status: *${q.label}*`,
      `   ${q.detail}`,
      `   Restrições no mês: *${t.restrictions || t.blocks}*`,
      `   Falhas totais: *${t.failed}*`,
      `   Taxa de resposta geral: *${pct(t.responses, t.totalDispatches)}*`,
      ``,
      `💡 *INSIGHTS ESTRATÉGICOS*`,
      ...insights.map(i => `   ${i}`),
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `_Optimus CRM • Relatório automático_`,
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
    const costPerResponse = t.responses > 0 ? fmt(t.totalCost / t.responses) : "—";
    const insights = generateInsight(t);

    // Day-by-day breakdown
    const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const dayLines = weeklyData.days.map((d, i) => {
      const dayDate = new Date(weekStartDate);
      dayDate.setDate(dayDate.getDate() + i);
      return `   ${dayNames[i]} (${dayDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}): ${d.totalDispatches} envios | ${d.delivered} entregues | ${d.responses} respostas${d.restrictions > 0 ? ` | ⚠️ ${d.restrictions} restrições` : ""}`;
    });

    // Best/worst day
    let bestDay = 0, worstDay = 0;
    weeklyData.days.forEach((d, i) => {
      if (d.responses > weeklyData.days[bestDay].responses) bestDay = i;
      if (d.totalDispatches > 0 && (weeklyData.days[worstDay].totalDispatches === 0 || d.delivered / d.totalDispatches < weeklyData.days[worstDay].delivered / weeklyData.days[worstDay].totalDispatches)) worstDay = i;
    });

    return [
      `━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *RELATÓRIO SEMANAL DE PERFORMANCE*`,
      `📅 ${weekLabel}`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `📨 *RESUMO DA SEMANA*`,
      `   Total de disparos: *${t.totalDispatches}*`,
      `   Entregues: *${t.delivered}*`,
      `   Respostas: *${t.responses}*`,
      `   Falhas: *${t.failed}*`,
      ``,
      `📈 *PERFORMANCE*`,
      `   Taxa de entrega: *${pct(t.delivered, t.totalDispatches)}*`,
      `   Taxa de resposta: *${pct(t.responses, t.totalDispatches)}*`,
      `   Custo por resposta: *${costPerResponse}*`,
      ``,
      `💰 *INVESTIMENTO*`,
      `   Total: *${fmt(t.totalCost)}*`,
      `   • Marketing: ${t.marketing.count} envios — ${fmt(t.marketing.cost)}`,
      `   • Utilidade: ${t.utility.count} envios — ${fmt(t.utility.cost)}`,
      `   • Serviço: ${t.service.count} envios — ${fmt(t.service.cost)}`,
      ``,
      `📅 *DETALHAMENTO DIÁRIO*`,
      ...dayLines,
      ``,
      ...(weeklyData.days.length > 1 ? [
        `🏆 *DESTAQUES*`,
        `   Melhor dia (respostas): *${dayNames[bestDay]}* — ${weeklyData.days[bestDay].responses} respostas`,
        `   Dia com menor entrega: *${dayNames[worstDay]}* — ${pct(weeklyData.days[worstDay].delivered, weeklyData.days[worstDay].totalDispatches)}`,
        ``,
      ] : []),
      `🔄 *COMPARATIVO (vs semana anterior)*`,
      `   Disparos: ${variation(t.totalDispatches, prev.totalDispatches)}`,
      `   Respostas: ${variation(t.responses, prev.responses)}`,
      `   Entregues: ${variation(t.delivered, prev.delivered)}`,
      `   Falhas: ${variation(t.failed, prev.failed)}`,
      ``,
      `${q.emoji} *SAÚDE DA CONTA*`,
      `   Status: *${q.label}*`,
      `   ${q.detail}`,
      `   Restrições na semana: *${t.restrictions || t.blocks}*`,
      `   Taxa de falha: *${pct(t.failed, t.totalDispatches)}*`,
      ``,
      `💡 *INSIGHTS*`,
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
