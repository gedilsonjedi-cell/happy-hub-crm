import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useDispatchCosts } from "@/hooks/useDispatchCosts";
import { toast } from "sonner";
import { Phone, Send, Save, FileText, Calendar, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DispatchReportSender() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const { summary, byType, counts } = useDispatchCosts();
  const [reportPhone, setReportPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");

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
  const dateStr = today.toLocaleDateString("pt-BR");
  const monthStr = today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const totalDispatches = counts.marketing + counts.utility + counts.service;

  const buildDailyReport = () => {
    return [
      `📊 *RELATÓRIO DIÁRIO DE DISPAROS*`,
      `📅 Data: ${dateStr}`,
      ``,
      `💰 *Investimento do dia:* ${formatCurrency(summary.daily)}`,
      `📨 *Total de disparos:* ${totalDispatches}`,
      ``,
      `📋 *Por tipo:*`,
      `• Marketing: ${counts.marketing} disparos — ${formatCurrency(byType.marketing)}`,
      `• Utilidade: ${counts.utility} disparos — ${formatCurrency(byType.utility)}`,
      `• Serviço: ${counts.service} disparos — ${formatCurrency(byType.service)}`,
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

          {/* Preview */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono border border-border">
            {reportType === "daily" ? buildDailyReport() : buildMonthlyReport()}
          </div>

          <Button
            onClick={handleSendReport}
            className="w-full"
            variant="whatsapp"
            size="lg"
            disabled={!reportPhone}
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
