import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useDispatchCosts } from "@/hooks/useDispatchCosts";
import { toast } from "sonner";
import { Phone, Send, Save, FileText, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USD_TO_BRL_RATE = 6.0;

interface DayData {
  totalCost: number;
  totalDispatches: number;
  marketing: { count: number; cost: number };
  utility: { count: number; cost: number };
  service: { count: number; cost: number };
}

export function DispatchReportSender() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const { summary, byType, counts } = useDispatchCosts();
  const [reportPhone, setReportPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  });
  const [customDayData, setCustomDayData] = useState<DayData | null>(null);
  const [loadingDayData, setLoadingDayData] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const isToday = selectedDate === todayStr;

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

  const fetchDayData = useCallback(async (date: string) => {
    if (!effectiveOrganizationId) return;
    setLoadingDayData(true);

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const { data: channels } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", effectiveOrganizationId);

    if (!channels || channels.length === 0) {
      setCustomDayData({ totalCost: 0, totalDispatches: 0, marketing: { count: 0, cost: 0 }, utility: { count: 0, cost: 0 }, service: { count: 0, cost: 0 } });
      setLoadingDayData(false);
      return;
    }

    const channelIds = channels.map(c => c.id);

    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("metadata, created_at")
      .in("channel_id", channelIds)
      .eq("direction", "outbound")
      .in("status", ["delivered", "sent", "read"])
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .limit(2000);

    const result: DayData = {
      totalCost: 0,
      totalDispatches: 0,
      marketing: { count: 0, cost: 0 },
      utility: { count: 0, cost: 0 },
      service: { count: 0, cost: 0 },
    };

    (messages || []).forEach((msg) => {
      const metadata = msg.metadata as Record<string, unknown> | null;
      if (!metadata) return;
      const costUSD = Number(metadata.cost || 0);
      const costBRL = costUSD * USD_TO_BRL_RATE;
      const dispatchType = (metadata.dispatch_type as string) || "service";

      result.totalCost += costBRL;
      result.totalDispatches += 1;

      if (dispatchType === "marketing") {
        result.marketing.count += 1;
        result.marketing.cost += costBRL;
      } else if (dispatchType === "utility") {
        result.utility.count += 1;
        result.utility.cost += costBRL;
      } else {
        result.service.count += 1;
        result.service.cost += costBRL;
      }
    });

    result.totalCost = Math.round(result.totalCost * 100) / 100;
    result.marketing.cost = Math.round(result.marketing.cost * 100) / 100;
    result.utility.cost = Math.round(result.utility.cost * 100) / 100;
    result.service.cost = Math.round(result.service.cost * 100) / 100;

    setCustomDayData(result);
    setLoadingDayData(false);
  }, [effectiveOrganizationId]);

  // Fetch data when date changes and it's not today
  useEffect(() => {
    if (!isToday && reportType === "daily") {
      fetchDayData(selectedDate);
    } else {
      setCustomDayData(null);
    }
  }, [selectedDate, isToday, reportType, fetchDayData]);

  const handleSavePhone = async () => {
    if (!effectiveOrganizationId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ report_phone: reportPhone } as any)
      .eq("id", effectiveOrganizationId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar número");
    } else {
      toast.success("Número salvo com sucesso!");
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const today = new Date();
  const monthStr = today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const totalDispatches = counts.marketing + counts.utility + counts.service;

  // Get the data for the daily report based on selected date
  const getDailyData = () => {
    if (isToday) {
      return {
        cost: summary.daily,
        total: totalDispatches,
        marketing: { count: counts.marketing, cost: byType.marketing },
        utility: { count: counts.utility, cost: byType.utility },
        service: { count: counts.service, cost: byType.service },
      };
    }
    if (customDayData) {
      return {
        cost: customDayData.totalCost,
        total: customDayData.totalDispatches,
        marketing: customDayData.marketing,
        utility: customDayData.utility,
        service: customDayData.service,
      };
    }
    return { cost: 0, total: 0, marketing: { count: 0, cost: 0 }, utility: { count: 0, cost: 0 }, service: { count: 0, cost: 0 } };
  };

  const selectedDateFormatted = new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR");

  const buildDailyReport = () => {
    const d = getDailyData();
    return [
      `📊 *RELATÓRIO DIÁRIO DE DISPAROS*`,
      `📅 Data: ${selectedDateFormatted}`,
      ``,
      `💰 *Investimento do dia:* ${formatCurrency(d.cost)}`,
      `📨 *Total de disparos:* ${d.total}`,
      ``,
      `📋 *Por tipo:*`,
      `• Marketing: ${d.marketing.count} disparos — ${formatCurrency(d.marketing.cost)}`,
      `• Utilidade: ${d.utility.count} disparos — ${formatCurrency(d.utility.cost)}`,
      `• Serviço: ${d.service.count} disparos — ${formatCurrency(d.service.cost)}`,
      ``,
      `_Relatório gerado automaticamente pelo Optimus CRM_`,
    ].join("\n");
  };

  const buildMonthlyReport = () => {
    return [
      `📊 *RELATÓRIO MENSAL DE PERFORMANCE*`,
      `🗓️ Mês: ${monthStr}`,
      ``,
      `💰 *Investimento total:* ${formatCurrency(summary.monthly)}`,
      `📨 *Total de disparos no mês:* ${totalDispatches}`,
      ``,
      `📋 *Detalhamento por tipo:*`,
      `• Marketing: ${counts.marketing} disparos — ${formatCurrency(byType.marketing)}`,
      `• Utilidade: ${counts.utility} disparos — ${formatCurrency(byType.utility)}`,
      `• Serviço: ${counts.service} disparos — ${formatCurrency(byType.service)}`,
      ``,
      `📈 *Resumo semanal:* ${formatCurrency(summary.weekly)}`,
      `📈 *Total acumulado:* ${formatCurrency(summary.total)}`,
      ``,
      `_Relatório gerado automaticamente pelo Optimus CRM_`,
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
      {/* Config do telefone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Destinatário do Relatório
          </CardTitle>
          <CardDescription>
            Cadastre o número de WhatsApp que receberá os relatórios de disparos
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

      {/* Geração do relatório */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Gerar Relatório
          </CardTitle>
          <CardDescription>
            Escolha o tipo de relatório e envie diretamente pelo WhatsApp
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

          {/* Date selector for daily reports */}
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
              {!isToday && (
                <p className="text-xs text-muted-foreground">
                  📅 Gerando relatório do dia {selectedDateFormatted}
                </p>
              )}
            </div>
          )}

          {/* Preview */}
          {loadingDayData ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Carregando dados do dia...</span>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono border border-border">
              {reportType === "daily" ? buildDailyReport() : buildMonthlyReport()}
            </div>
          )}

          <Button
            onClick={handleSendReport}
            className="w-full"
            variant="whatsapp"
            size="lg"
            disabled={!reportPhone || loadingDayData}
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
