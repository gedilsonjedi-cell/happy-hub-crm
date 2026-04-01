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
  marketing: { count: number; cost: number; delivered: number; failed: number };
  utility: { count: number; cost: number; delivered: number; failed: number };
  service: { count: number; cost: number; delivered: number; failed: number };
}

const emptyDay = (): DayData => ({
  totalDispatches: 0, delivered: 0, failed: 0, totalCost: 0, responses: 0, blocks: 0,
  marketing: { count: 0, cost: 0, delivered: 0, failed: 0 },
  utility: { count: 0, cost: 0, delivered: 0, failed: 0 },
  service: { count: 0, cost: 0, delivered: 0, failed: 0 },
});

export function DispatchReportSender() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [reportPhone, setReportPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dayData, setDayData] = useState<DayData>(emptyDay());
  const [prevDayData, setPrevDayData] = useState<DayData>(emptyDay());
  const [monthData, setMonthData] = useState<{ weeks: DayData[]; total: DayData }>({ weeks: [], total: emptyDay() });
  const [loadingData, setLoadingData] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

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

    // Fetch outbound messages
    const { data: outbound } = await supabase
      .from("whatsapp_messages")
      .select("metadata, status")
      .in("channel_id", channelIds)
      .eq("direction", "outbound")
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(5000);

    // Fetch inbound messages (responses)
    const { data: inbound } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .in("channel_id", channelIds)
      .eq("direction", "inbound")
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(5000);

    const result = emptyDay();
    result.responses = inbound?.length || 0;

    (outbound || []).forEach((msg) => {
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
  useEffect(() => {
    if (!effectiveOrganizationId || reportType !== "monthly") return;
    const load = async () => {
      setLoadingData(true);
      const channelIds = await getChannelIds();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const today = new Date();

      // Split into weeks
      const weeks: DayData[] = [];
      const total = emptyDay();
      let weekStart = new Date(firstDay);
      
      while (weekStart <= today) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > today) weekEnd.setTime(today.getTime());

        const startStr = weekStart.toISOString().split("T")[0];
        const endStr = weekEnd.toISOString().split("T")[0];

        // Fetch week data in one query
        const start = `${startStr}T00:00:00.000Z`;
        const end = `${endStr}T23:59:59.999Z`;

        const [{ data: outbound }, { data: inbound }] = await Promise.all([
          supabase.from("whatsapp_messages").select("metadata, status")
            .in("channel_id", channelIds).eq("direction", "outbound")
            .gte("created_at", start).lte("created_at", end).limit(5000),
          supabase.from("whatsapp_messages").select("id")
            .in("channel_id", channelIds).eq("direction", "inbound")
            .gte("created_at", start).lte("created_at", end).limit(5000),
        ]);

        const week = emptyDay();
        week.responses = inbound?.length || 0;
        (outbound || []).forEach((msg) => {
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
        week.totalCost = Math.round(week.totalCost * 100) / 100;
        weeks.push(week);

        // Accumulate
        total.totalDispatches += week.totalDispatches;
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
        weekStart.setDate(weekStart.getDate() + 1);
      }

      total.totalCost = Math.round(total.totalCost * 100) / 100;
      total.marketing.cost = Math.round(total.marketing.cost * 100) / 100;
      total.utility.cost = Math.round(total.utility.cost * 100) / 100;
      total.service.cost = Math.round(total.service.cost * 100) / 100;

      setMonthData({ weeks, total });
      setLoadingData(false);
    };
    load();
  }, [effectiveOrganizationId, reportType, getChannelIds]);

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
  const now = new Date();
  const monthStr = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

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
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
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

    if (avgDaily > 0) {
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
