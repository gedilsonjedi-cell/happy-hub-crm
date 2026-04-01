import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDispatchCosts } from "@/hooks/useDispatchCosts";
import { DollarSign, TrendingUp, Send, Megaphone, Settings, Wrench, Hash, MessageSquare, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ConversationMetricsPanel } from "@/components/reports/ConversationMetricsPanel";
import { DispatchReportSender } from "@/components/reports/DispatchReportSender";
import { useState } from "react";

export default function Relatorios() {
  const { summary, byType, counts, loading } = useDispatchCosts();
  const [activeTab, setActiveTab] = useState("atendimento");

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const totalByType = byType.marketing + byType.utility + byType.service;
  const totalCounts = counts.marketing + counts.utility + counts.service;
  
  const getPercentage = (value: number) => {
    if (totalByType === 0) return 0;
    return Math.round((value / totalByType) * 100);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Acompanhe métricas de atendimento e investimentos em disparos
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="atendimento" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Atendimento
            </TabsTrigger>
            <TabsTrigger value="investimento" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Investimento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atendimento">
            <ConversationMetricsPanel />
          </TabsContent>

          <TabsContent value="investimento">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Hoje</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.daily)}</div>
                  <p className="text-xs text-muted-foreground">
                    Investido hoje em disparos
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.weekly)}</div>
                  <p className="text-xs text-muted-foreground">
                    Investido nesta semana
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Este Mês</CardTitle>
                  <Send className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.monthly)}</div>
                  <p className="text-xs text-muted-foreground">
                    Investido neste mês
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Geral</CardTitle>
                  <DollarSign className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(summary.total)}</div>
                  <p className="text-xs text-muted-foreground">
                    {totalCounts} disparos realizados
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Investimento por Tipo de Disparo</CardTitle>
                <CardDescription>
                  Distribuição dos gastos por categoria de mensagem (valores em BRL convertidos de USD)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Marketing */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        <Megaphone className="w-4 h-4 text-orange-500" />
                      </div>
                      <div>
                        <p className="font-medium">Marketing</p>
                        <p className="text-xs text-muted-foreground">Campanhas promocionais</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(byType.marketing)}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Hash className="w-3 h-3" />
                        <span>{counts.marketing} disparos</span>
                        <span className="mx-1">•</span>
                        <span>{getPercentage(byType.marketing)}%</span>
                      </div>
                    </div>
                  </div>
                  <Progress value={getPercentage(byType.marketing)} className="h-2" />
                </div>

                {/* Utility */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Settings className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium">Utilidade</p>
                        <p className="text-xs text-muted-foreground">Notificações e alertas</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(byType.utility)}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Hash className="w-3 h-3" />
                        <span>{counts.utility} disparos</span>
                        <span className="mx-1">•</span>
                        <span>{getPercentage(byType.utility)}%</span>
                      </div>
                    </div>
                  </div>
                  <Progress value={getPercentage(byType.utility)} className="h-2" />
                </div>

                {/* Service */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Wrench className="w-4 h-4 text-green-500" />
                      </div>
                      <div>
                        <p className="font-medium">Serviço</p>
                        <p className="text-xs text-muted-foreground">Suporte e atendimento</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(byType.service)}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Hash className="w-3 h-3" />
                        <span>{counts.service} disparos</span>
                        <span className="mx-1">•</span>
                        <span>{getPercentage(byType.service)}%</span>
                      </div>
                    </div>
                  </div>
                  <Progress value={getPercentage(byType.service)} className="h-2" />
                </div>

                {totalByType === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Send className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhum disparo registrado ainda</p>
                    <p className="text-sm">Os custos aparecerão aqui após realizar disparos</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
