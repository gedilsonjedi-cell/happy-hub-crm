import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, Megaphone, FileText, DollarSign, Headphones } from "lucide-react";
import { ConversationHeatmap } from "@/components/reports/ConversationHeatmap";
import { ButtonTrafficHeatmap } from "@/components/reports/ButtonTrafficHeatmap";
import { AgentPerformanceTable } from "@/components/reports/AgentPerformanceTable";
import { CampaignTrafficPanel } from "@/components/reports/CampaignTrafficPanel";
import { DispatchReportSender } from "@/components/reports/DispatchReportSender";
import { ConversationMetricsPanel } from "@/components/reports/ConversationMetricsPanel";
import { AttendanceReportPanel } from "@/components/reports/AttendanceReportPanel";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

const ALLOWED_EMAILS = ["allan.pedro147@gmail.com", "gedilson.junior@gmail.com", "henrique.miranda@henrimath.com.br"];

export default function Relatorios() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, isAdmin, loading: roleLoading } = useUserRole(user?.id);
  const [activeTab, setActiveTab] = useState("trafego");

  const userEmail = user?.email?.trim().toLowerCase() || "";
  const isEmailAllowed = ALLOWED_EMAILS.includes(userEmail);
  const hasAccess = isEmailAllowed || isSuperAdmin || isAdmin;

  if (authLoading || (!!user?.id && !isEmailAllowed && roleLoading)) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!hasAccess) return <Navigate to="/" replace />;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Visão geral de tráfego, agentes e campanhas
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="trafego" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Tráfego
            </TabsTrigger>
            <TabsTrigger value="atendimentos" className="flex items-center gap-2">
              <Headphones className="w-4 h-4" />
              Atendimentos
            </TabsTrigger>
            <TabsTrigger value="agentes" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Agentes
            </TabsTrigger>
            <TabsTrigger value="campanhas" className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="atendimento" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Métricas
            </TabsTrigger>
            <TabsTrigger value="enviar" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Enviar Relatório
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trafego" className="space-y-6">
            <ConversationHeatmap />
            <ButtonTrafficHeatmap />
          </TabsContent>

          <TabsContent value="atendimentos">
            <AttendanceReportPanel />
          </TabsContent>

          <TabsContent value="agentes">
            <AgentPerformanceTable />
          </TabsContent>

          <TabsContent value="campanhas">
            <CampaignTrafficPanel />
          </TabsContent>

          <TabsContent value="atendimento">
            <ConversationMetricsPanel />
          </TabsContent>

          <TabsContent value="enviar">
            <DispatchReportSender />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
