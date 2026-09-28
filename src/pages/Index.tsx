import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Send,
  Timer,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { getExternalAssignments } from "@/lib/externalAssignments";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Period = "today" | "7d" | "30d";

interface DashboardStats {
  totalLeads: number;
  newToday: number;
  openConversations: number;
  campaignsSent: number;
  resolvedToday: number;
  avgResponseTime: number;
  pendingConversations: number;
  inProgressConversations: number;
}

interface AttendantMetrics {
  userId: string;
  displayName: string;
  email: string;
  inProgress: number;
  pending: number;
  resolved: number;
  isAvailable: boolean;
}

interface DailyStats {
  date: string;
  fullDate: string;
  resolved: number;
  newConversations: number;
}

interface LeadDistribution {
  name: string;
  value: number;
}

interface RecentActivity {
  id: string;
  type: "message_received" | "message_sent";
  description: string;
  timestamp: string;
}

const EMPTY_STATS: DashboardStats = {
  totalLeads: 0,
  newToday: 0,
  openConversations: 0,
  campaignsSent: 0,
  resolvedToday: 0,
  avgResponseTime: 0,
  pendingConversations: 0,
  inProgressConversations: 0,
};

const periodLabels: Record<Period, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

const attendanceChartConfig = {
  newConversations: { label: "Iniciados", color: "hsl(var(--chart-2))" },
  resolved: { label: "Resolvidos", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

const stateChartConfig = {
  resolved: { label: "Finalizados", color: "hsl(var(--success))" },
  active: { label: "Em atendimento", color: "hsl(var(--info))" },
  pending: { label: "Aguardando", color: "hsl(var(--warning))" },
} satisfies ChartConfig;

const leadChartConfig = {
  value: { label: "Leads", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

const leadChartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function getPeriodStart(period: Period) {
  const today = startOfDay(new Date());
  if (period === "today") return today;
  return subDays(today, period === "7d" ? 6 : 29);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatResponseTime(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}min`;
}

function EmptyState({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ModuleSkeleton({ chart = false }: { chart?: boolean }) {
  return (
    <div className="space-y-4 p-1">
      <Skeleton className="h-5 w-32" />
      <Skeleton className={cn("w-full", chart ? "h-52" : "h-12")} />
      {!chart && <Skeleton className="h-12 w-full" />}
    </div>
  );
}

const Index = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [attendantMetrics, setAttendantMetrics] = useState<AttendantMetrics[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [leadDistribution, setLeadDistribution] = useState<LeadDistribution[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  const fetchDashboardData = useCallback(async () => {
    if (!user || !effectiveOrganizationId) return;
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const periodStart = getPeriodStart(period);
      const periodStartIso = periodStart.toISOString();
      const dayCount = period === "today" ? 1 : period === "7d" ? 7 : 30;

      const [totalLeadsResult, periodLeadsResult, campaignsResult, channelsResult, availabilityResult, profilesResult, stagesResult] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("organization_id", effectiveOrganizationId),
        supabase.from("leads").select("stage_id, created_at").eq("organization_id", effectiveOrganizationId).gte("created_at", periodStartIso),
        supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("organization_id", effectiveOrganizationId).eq("status", "completed").gte("created_at", periodStartIso),
        (supabase as any).from("channels_public").select("id").eq("organization_id", effectiveOrganizationId),
        supabase.from("attendant_availability").select("user_id, is_available, current_conversations").eq("organization_id", effectiveOrganizationId),
        supabase.from("profiles").select("user_id, display_name, email").eq("organization_id", effectiveOrganizationId),
        supabase.from("pipeline_stages").select("id, name").eq("organization_id", effectiveOrganizationId).order("position", { ascending: true }),
      ]);

      const baseErrors = [totalLeadsResult.error, periodLeadsResult.error, campaignsResult.error, channelsResult.error, availabilityResult.error, profilesResult.error, stagesResult.error].filter(Boolean);
      if (baseErrors.length > 0) throw baseErrors[0];

      const channelIds = (channelsResult.data || []).map((channel: { id: string }) => channel.id);
      let assignments: Array<{
        assigned_to?: string | null;
        status?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
      }> = [];

      if (channelIds.length > 0) {
        const externalClient = await getExternalAssignments();
        const assignmentsResult = await externalClient
          .from("conversation_assignments")
          .select("assigned_to, status, created_at, updated_at")
          .in("channel_id", channelIds);
        if (assignmentsResult.error) throw assignmentsResult.error;
        assignments = assignmentsResult.data || [];
      }

      const periodAssignments = assignments.filter((assignment) => {
        const createdAt = assignment.created_at ? new Date(assignment.created_at).getTime() : 0;
        return createdAt >= periodStart.getTime();
      });
      const resolvedInPeriod = assignments.filter((assignment) => {
        const updatedAt = assignment.updated_at ? new Date(assignment.updated_at).getTime() : 0;
        return assignment.status === "resolved" && updatedAt >= periodStart.getTime();
      });
      const pendingConversations = assignments.filter((assignment) => assignment.status === "pending").length;
      const inProgressConversations = assignments.filter((assignment) => assignment.status === "active").length;

      let messages: Array<{ direction: string; sender_phone: string | null; created_at: string }> = [];
      let recentMessages: Array<{ id: string; sender_name: string | null; sender_phone: string | null; direction: string; created_at: string }> = [];
      if (channelIds.length > 0) {
        const [messagesResult, recentMessagesResult] = await Promise.all([
          supabase
            .from("whatsapp_messages")
            .select("direction, sender_phone, created_at")
            .in("channel_id", channelIds)
            .gte("created_at", periodStartIso)
            .order("created_at", { ascending: true })
            .limit(500),
          supabase
            .from("whatsapp_messages")
            .select("id, sender_name, sender_phone, direction, created_at")
            .in("channel_id", channelIds)
            .gte("created_at", periodStartIso)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        if (messagesResult.error) throw messagesResult.error;
        if (recentMessagesResult.error) throw recentMessagesResult.error;
        messages = messagesResult.data || [];
        recentMessages = recentMessagesResult.data || [];
      }

      const messagesByPhone: Record<string, Array<{ direction: string; created_at: string }>> = {};
      messages.forEach((message) => {
        const key = message.sender_phone || "sem-identificador";
        if (!messagesByPhone[key]) messagesByPhone[key] = [];
        messagesByPhone[key].push(message);
      });

      let totalResponseTime = 0;
      let responseCount = 0;
      Object.values(messagesByPhone).forEach((phoneMessages) => {
        for (let index = 1; index < phoneMessages.length; index += 1) {
          if (phoneMessages[index - 1].direction === "inbound" && phoneMessages[index].direction === "outbound") {
            const inboundTime = new Date(phoneMessages[index - 1].created_at).getTime();
            const outboundTime = new Date(phoneMessages[index].created_at).getTime();
            const difference = (outboundTime - inboundTime) / 1000 / 60;
            if (difference > 0 && difference < 1440) {
              totalResponseTime += difference;
              responseCount += 1;
            }
          }
        }
      });

      setStats({
        totalLeads: totalLeadsResult.count || 0,
        newToday: periodLeadsResult.data?.length || 0,
        openConversations: pendingConversations + inProgressConversations,
        campaignsSent: campaignsResult.count || 0,
        resolvedToday: resolvedInPeriod.length,
        avgResponseTime: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0,
        pendingConversations,
        inProgressConversations,
      });

      const metricsMap: Record<string, AttendantMetrics> = {};
      (profilesResult.data || []).forEach((profile) => {
        metricsMap[profile.user_id] = {
          userId: profile.user_id,
          displayName: profile.display_name || profile.email || "Atendente",
          email: profile.email || "",
          inProgress: 0,
          pending: 0,
          resolved: 0,
          isAvailable: false,
        };
      });
      (availabilityResult.data || []).forEach((availability) => {
        const metric = metricsMap[availability.user_id];
        if (!metric) return;
        metric.isAvailable = availability.is_available || false;
      });
      assignments.forEach((assignment) => {
        const metric = assignment.assigned_to ? metricsMap[assignment.assigned_to] : undefined;
        if (!metric) return;
        if (assignment.status === "active") metric.inProgress += 1;
        if (assignment.status === "pending") metric.pending += 1;
        if (assignment.status === "resolved" && assignment.updated_at && new Date(assignment.updated_at) >= periodStart) metric.resolved += 1;
      });
      setAttendantMetrics(Object.values(metricsMap).filter((metric) => metric.inProgress > 0 || metric.pending > 0 || metric.resolved > 0 || metric.isAvailable));

      const days: DailyStats[] = [];
      for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
        const date = subDays(startOfDay(now), offset);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        days.push({
          date: dayCount === 30 ? format(date, "dd/MM") : format(date, "EEE", { locale: ptBR }),
          fullDate: format(date, "dd 'de' MMMM", { locale: ptBR }),
          newConversations: periodAssignments.filter((assignment) => {
            const createdAt = assignment.created_at ? new Date(assignment.created_at) : null;
            return createdAt && createdAt >= date && createdAt < nextDate;
          }).length,
          resolved: resolvedInPeriod.filter((assignment) => {
            const updatedAt = assignment.updated_at ? new Date(assignment.updated_at) : null;
            return updatedAt && updatedAt >= date && updatedAt < nextDate;
          }).length,
        });
      }
      setDailyStats(days);

      const stageNames = new Map((stagesResult.data || []).map((stage) => [stage.id, stage.name]));
      const distributionMap = new Map<string, number>();
      (periodLeadsResult.data || []).forEach((lead) => {
        const name = lead.stage_id ? stageNames.get(lead.stage_id) || "Etapa não encontrada" : "Sem etapa";
        distributionMap.set(name, (distributionMap.get(name) || 0) + 1);
      });
      setLeadDistribution(Array.from(distributionMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

      setRecentActivity(recentMessages.map((message) => ({
        id: message.id,
        type: message.direction === "inbound" ? "message_received" : "message_sent",
        description: message.direction === "inbound"
          ? `Nova mensagem de ${message.sender_name || message.sender_phone || "contato"}`
          : `Mensagem enviada para ${message.sender_phone || message.sender_name || "contato"}`,
        timestamp: message.created_at,
      })));
    } catch (fetchError) {
      console.error("Error fetching dashboard data:", fetchError);
      setError("Não foi possível carregar os dados da Dashboard.");
      setStats(EMPTY_STATS);
      setAttendantMetrics([]);
      setDailyStats([]);
      setLeadDistribution([]);
      setRecentActivity([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, period, user]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const stateData = useMemo(() => [
    { name: "Finalizados", value: stats.resolvedToday, key: "resolved", color: "hsl(var(--success))" },
    { name: "Em atendimento", value: stats.inProgressConversations, key: "active", color: "hsl(var(--info))" },
    { name: "Aguardando", value: stats.pendingConversations, key: "pending", color: "hsl(var(--warning))" },
  ], [stats]);
  const stateTotal = stateData.reduce((total, item) => total + item.value, 0);
  const leadTotal = leadDistribution.reduce((total, item) => total + item.value, 0);
  const maxAttendantTotal = Math.max(...attendantMetrics.map((metric) => metric.inProgress + metric.pending + metric.resolved), 1);
  const hasDailyData = dailyStats.some((day) => day.newConversations > 0 || day.resolved > 0);

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[1680px] space-y-5 pb-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard CRM</h1>
            <p className="mt-1 text-sm text-muted-foreground">Visão geral do seu CRM WhatsApp</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
              <SelectTrigger className="w-full bg-card sm:w-36" aria-label="Período da Dashboard">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void fetchDashboardData()} disabled={loading} aria-label="Atualizar Dashboard">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchDashboardData()}>Tentar novamente</Button>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="relative overflow-hidden border-primary/30 bg-primary text-primary-foreground shadow-card xl:col-span-4">
            <CardContent className="relative flex min-h-52 flex-col justify-between p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary-foreground/80">Total de Leads</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              {loading ? <Skeleton className="h-12 w-32 bg-primary-foreground/20" /> : <p className="text-4xl font-semibold tabular-nums">{stats.totalLeads.toLocaleString("pt-BR")}</p>}
              <p className="text-xs text-primary-foreground/70">Base total do cliente selecionado</p>
            </CardContent>
          </Card>

          <Card className="shadow-card xl:col-span-5">
            <CardContent className="grid min-h-52 grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              {[
                { label: "Novos Hoje", value: stats.newToday, icon: UserPlus, tone: "text-success bg-success/10" },
                { label: "Conversas Abertas", value: stats.openConversations, icon: MessageSquare, tone: "text-info bg-info/10" },
                { label: "Campanhas Enviadas", value: stats.campaignsSent, icon: Send, tone: "text-primary bg-primary/10" },
              ].map((item) => (
                <div key={item.label} className="flex min-h-40 flex-col justify-between rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", item.tone)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value.toLocaleString("pt-BR")}</p>}
                  <div>
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{periodLabels[period]}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-card xl:col-span-3">
            <CardContent className="flex min-h-52 flex-col justify-between p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Tempo Médio de Resposta</p>
                  <p className="mt-1 text-xs text-muted-foreground">Primeira resposta · {periodLabels[period]}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
                  <Timer className="h-4 w-4" />
                </div>
              </div>
              {loading ? <Skeleton className="h-10 w-28" /> : <p className="text-3xl font-semibold tabular-nums text-foreground">{formatResponseTime(stats.avgResponseTime)}</p>}
              <div className="grid grid-cols-3 gap-2 border-t border-border/70 pt-4">
                {[
                  { label: "Resolvidos Hoje", value: stats.resolvedToday, color: "text-success" },
                  { label: "Pendentes", value: stats.pendingConversations, color: "text-warning" },
                  { label: "Em Andamento", value: stats.inProgressConversations, color: "text-info" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className={cn("text-lg font-semibold tabular-nums", item.color)}>{loading ? "—" : item.value}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="shadow-card xl:col-span-8">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Atendimentos por Dia
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Iniciados e resolvidos no período</p>
              </div>
              <Badge variant="secondary">{periodLabels[period]}</Badge>
            </CardHeader>
            <CardContent>
              {loading ? <ModuleSkeleton chart /> : hasDailyData ? (
                <ChartContainer config={attendanceChartConfig} className="h-72 w-full aspect-auto">
                  <BarChart data={dailyStats} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent labelKey="fullDate" />} />
                    <Bar dataKey="newConversations" fill="var(--color-newConversations)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <EmptyState icon={BarChart3} title="Sem atendimentos no período" description="As barras aparecerão quando houver conversas iniciadas ou resolvidas." />
              )}
              {!loading && hasDailyData && (
                <div className="mt-3 flex flex-wrap justify-center gap-5 border-t border-border/70 pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" />Iniciados</span>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Resolvidos</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card xl:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Resumo do Dia</CardTitle>
              <p className="text-xs text-muted-foreground">Situação dos atendimentos · {periodLabels[period]}</p>
            </CardHeader>
            <CardContent>
              {loading ? <ModuleSkeleton chart /> : stateTotal > 0 ? (
                <>
                  <div className="relative mx-auto h-52 max-w-64">
                    <ChartContainer config={stateChartConfig} className="h-full w-full aspect-auto">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie data={stateData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                          {stateData.map((item) => <Cell key={item.key} fill={item.color} />)}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-semibold tabular-nums text-foreground">{stateTotal}</span>
                      <span className="text-xs text-muted-foreground">total</span>
                    </div>
                  </div>
                  <div className="space-y-2.5 border-t border-border/70 pt-4">
                    {stateData.map((item) => (
                      <div key={item.key} className="flex items-center gap-3 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="flex-1 text-muted-foreground">{item.name}</span>
                        <span className="font-medium tabular-nums text-foreground">{item.value}</span>
                        <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round((item.value / stateTotal) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={MessageSquare} title="Sem atendimentos" description="A proporção dos estados aparecerá quando houver atividade." />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold"><UserCheck className="h-4 w-4 text-primary" />Desempenho por Atendente</CardTitle>
              <p className="text-xs text-muted-foreground">Atendimentos por responsável</p>
            </CardHeader>
            <CardContent>
              {loading ? <ModuleSkeleton /> : attendantMetrics.length > 0 ? (
                <ScrollArea className="h-80 pr-3">
                  <div className="space-y-5">
                    {attendantMetrics.map((attendant) => {
                      const total = attendant.inProgress + attendant.pending + attendant.resolved;
                      return (
                        <div key={attendant.userId} className="space-y-2.5">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(attendant.displayName)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{attendant.displayName}</p>
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", attendant.isAvailable ? "bg-success" : "bg-neutral")} />
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{attendant.email}</p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums">{total}</span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                            {attendant.resolved > 0 && <div className="bg-success" style={{ width: `${(attendant.resolved / maxAttendantTotal) * 100}%` }} />}
                            {attendant.inProgress > 0 && <div className="bg-info" style={{ width: `${(attendant.inProgress / maxAttendantTotal) * 100}%` }} />}
                            {attendant.pending > 0 && <div className="bg-warning" style={{ width: `${(attendant.pending / maxAttendantTotal) * 100}%` }} />}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{attendant.resolved} resolvidos</span><span>{attendant.inProgress} ativos</span><span>{attendant.pending} pendentes</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState icon={UserCheck} title="Nenhum desempenho no período" description="Os atendentes aparecerão após receberem ou concluírem atendimentos." />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Distribuição de Leads</CardTitle>
              <p className="text-xs text-muted-foreground">Etapas reais do Pipeline · {periodLabels[period]}</p>
            </CardHeader>
            <CardContent>
              {loading ? <ModuleSkeleton chart /> : leadTotal > 0 ? (
                <>
                  <div className="relative mx-auto h-48 max-w-60">
                    <ChartContainer config={leadChartConfig} className="h-full w-full aspect-auto">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie data={leadDistribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                          {leadDistribution.map((item, index) => <Cell key={item.name} fill={leadChartColors[index % leadChartColors.length]} />)}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-semibold tabular-nums text-foreground">{leadTotal}</span>
                      <span className="text-xs text-muted-foreground">leads</span>
                    </div>
                  </div>
                  <ScrollArea className="h-32 pr-3">
                    <div className="space-y-2.5">
                      {leadDistribution.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-3 text-xs">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: leadChartColors[index % leadChartColors.length] }} />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.name}</span>
                          <span className="font-medium tabular-nums text-foreground">{item.value}</span>
                          <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round((item.value / leadTotal) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <EmptyState icon={Users} title="Sem leads no período" description="A distribuição por etapa aparecerá quando houver leads no Pipeline." />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold"><Clock className="h-4 w-4 text-primary" />Atividade Recente</CardTitle>
              <p className="text-xs text-muted-foreground">Últimos eventos reais de mensagens</p>
            </CardHeader>
            <CardContent>
              {loading ? <ModuleSkeleton /> : recentActivity.length > 0 ? (
                <ScrollArea className="h-80 pr-3">
                  <div className="space-y-1">
                    {recentActivity.map((activity) => {
                      const received = activity.type === "message_received";
                      return (
                        <div key={activity.id} className="flex items-start gap-3 border-b border-border/60 py-3 last:border-0">
                          <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", received ? "bg-success/10 text-success" : "bg-info/10 text-info")}>
                            {received ? <MessageSquare className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-foreground">{activity.description}</p>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{received ? "Recebida" : "Enviada"}</span>
                              <span>•</span>
                              <time dateTime={activity.timestamp}>{format(new Date(activity.timestamp), "dd/MM · HH:mm", { locale: ptBR })}</time>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("shrink-0", received ? "text-success" : "text-info")}>{received ? "Entrada" : "Saída"}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState icon={Clock} title="Nenhuma atividade recente" description="As mensagens enviadas e recebidas aparecerão aqui." />
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
};

export default Index;