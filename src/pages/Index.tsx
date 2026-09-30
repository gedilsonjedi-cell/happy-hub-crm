import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type DashboardModule = "leads" | "campaigns" | "attendance" | "chart" | "distribution" | "activity";

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

const EMPTY_LOADING: Record<DashboardModule, boolean> = {
  leads: false,
  campaigns: false,
  attendance: false,
  chart: false,
  distribution: false,
  activity: false,
};

const ACTIVE_LOADING: Record<DashboardModule, boolean> = {
  leads: true,
  campaigns: true,
  attendance: true,
  chart: true,
  distribution: true,
  activity: true,
};

function withTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs = 10000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs / 1000}s`)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

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

// Status reais gravados em conversation_assignments: pending | in_progress | archived
// ("active"/"resolved" são legados e continuam aceitos).
const isPending = (status?: string | null) => status === "pending";
const isInProgress = (status?: string | null) => status === "in_progress" || status === "active";
const isResolved = (status?: string | null) => status === "archived" || status === "resolved";
const SENT_CAMPAIGN_STATUSES = ["running", "paused", "completed"];
const REFRESH_INTERVAL_MS = 30000;

async function fetchAllPages<T>(
  page: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < maxPages; index += 1) {
    const { data, error } = await page(index * pageSize, (index + 1) * pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

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
  const { user, loading: authLoading } = useAuth();
  const { effectiveOrganizationId, isLoading: organizationLoading } = useEffectiveOrganizationId();
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [readinessTimedOut, setReadinessTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moduleErrors, setModuleErrors] = useState<Partial<Record<DashboardModule, string>>>({});
  const [moduleLoading, setModuleLoading] = useState<Record<DashboardModule, boolean>>(ACTIVE_LOADING);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [attendantMetrics, setAttendantMetrics] = useState<AttendantMetrics[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [leadDistribution, setLeadDistribution] = useState<LeadDistribution[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const requestIdRef = useRef(0);
  const userId = user?.id;

  const updateStats = useCallback((values: Partial<DashboardStats>) => {
    setStats((current) => ({ ...current, ...values }));
  }, []);

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!userId || !effectiveOrganizationId) {
      setLoading(false);
      setModuleLoading(EMPTY_LOADING);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!silent) {
      setLoading(true);
      setError(null);
      setModuleErrors({});
      setModuleLoading(ACTIVE_LOADING);
    }

    const now = new Date();
    const periodStart = getPeriodStart(period);
    const periodStartIso = periodStart.toISOString();
    const dayCount = period === "today" ? 1 : period === "7d" ? 7 : 30;

    const finishModule = (module: DashboardModule) => {
      if (requestIdRef.current !== requestId) return;
      setModuleLoading((current) => ({ ...current, [module]: false }));
    };

    const failModule = (module: DashboardModule, failure: unknown) => {
      if (requestIdRef.current !== requestId) return;
      const message = failure instanceof Error ? failure.message : "Consulta indisponível";
      console.error(`[Dashboard:${module}]`, failure);
      setModuleErrors((current) => ({ ...current, [module]: message }));
    };

    const runModule = async (module: DashboardModule, task: () => Promise<void>) => {
      try {
        await withTimeout(task(), `Dashboard:${module}`);
      } catch (failure) {
        failModule(module, failure);
      } finally {
        finishModule(module);
      }
    };

    let channelIds: string[] = [];
    try {
      const channelsResult: { data: Array<{ id: string }> | null; error: Error | null } = await withTimeout(
        (supabase as any).from("channels_public").select("id").eq("organization_id", effectiveOrganizationId),
        "Dashboard:canais",
      );
      if (channelsResult.error) throw channelsResult.error;
      channelIds = (channelsResult.data || []).map((channel: { id: string }) => channel.id);
    } catch (failure) {
      failModule("attendance", failure);
      failModule("chart", failure);
      failModule("activity", failure);
    }

    const assignmentsPromise = runModule("attendance", async () => {
      const [availabilityResult, profilesResult] = await Promise.all([
        withTimeout(supabase.from("attendant_availability").select("user_id, is_available, current_conversations").eq("organization_id", effectiveOrganizationId), "Dashboard:disponibilidade"),
        withTimeout(supabase.from("profiles").select("user_id, display_name, email").eq("organization_id", effectiveOrganizationId), "Dashboard:perfis"),
      ]);
      if (availabilityResult.error) throw availabilityResult.error;
      if (profilesResult.error) throw profilesResult.error;

      let assignments: Array<{ assigned_to?: string | null; status?: string | null; created_at?: string | null; updated_at?: string | null }> = [];
      if (channelIds.length > 0) {
        // Passa a organização efetiva: sem isso, o super admin navegando como cliente recebe um token sem a org e o RLS externo devolve vazio.
        const externalClient = await withTimeout(getExternalAssignments(effectiveOrganizationId), "Dashboard:cliente externo");
        // Só o que importa para o período: conversas abertas + criadas/atualizadas no período, paginado (evita o corte de 1000 linhas).
        assignments = await fetchAllPages((from, to) => withTimeout(
          externalClient.from("conversation_assignments")
            .select("id, assigned_to, status, created_at, updated_at")
            .in("channel_id", channelIds)
            .or(`status.neq.archived,updated_at.gte.${periodStartIso},created_at.gte.${periodStartIso}`)
            .order("id", { ascending: true })
            .range(from, to),
          "Dashboard:atendimentos",
        ));
      }

      if (requestIdRef.current !== requestId) return;
      const periodAssignments = assignments.filter((assignment) => assignment.created_at && new Date(assignment.created_at).getTime() >= periodStart.getTime());
      const resolvedInPeriod = assignments.filter((assignment) => isResolved(assignment.status) && assignment.updated_at && new Date(assignment.updated_at).getTime() >= periodStart.getTime());
      const pendingConversations = assignments.filter((assignment) => isPending(assignment.status)).length;
      const inProgressConversations = assignments.filter((assignment) => isInProgress(assignment.status)).length;
      updateStats({
        openConversations: pendingConversations + inProgressConversations,
        resolvedToday: resolvedInPeriod.length,
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
        if (metric) metric.isAvailable = availability.is_available || false;
      });
      assignments.forEach((assignment) => {
        const metric = assignment.assigned_to ? metricsMap[assignment.assigned_to] : undefined;
        if (!metric) return;
        if (isInProgress(assignment.status)) metric.inProgress += 1;
        if (isPending(assignment.status)) metric.pending += 1;
        if (isResolved(assignment.status) && assignment.updated_at && new Date(assignment.updated_at) >= periodStart) metric.resolved += 1;
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
          newConversations: periodAssignments.filter((assignment) => assignment.created_at && new Date(assignment.created_at) >= date && new Date(assignment.created_at) < nextDate).length,
          resolved: resolvedInPeriod.filter((assignment) => assignment.updated_at && new Date(assignment.updated_at) >= date && new Date(assignment.updated_at) < nextDate).length,
        });
      }
      setDailyStats(days);
      finishModule("chart");
    });

    const leadsPromise = runModule("leads", async () => {
      const leadsInPeriod = () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", effectiveOrganizationId).gte("created_at", periodStartIso);
      const [totalLeadsResult, periodLeadsResult, stagesResult] = await Promise.all([
        withTimeout(supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", effectiveOrganizationId), "Dashboard:total de leads"),
        withTimeout(leadsInPeriod(), "Dashboard:leads do período"),
        withTimeout(supabase.from("pipeline_stages").select("id, name").eq("organization_id", effectiveOrganizationId).order("order_index", { ascending: true }), "Dashboard:etapas"),
      ]);
      if (totalLeadsResult.error) throw totalLeadsResult.error;
      if (periodLeadsResult.error) throw periodLeadsResult.error;
      if (stagesResult.error) throw stagesResult.error;
      if (requestIdRef.current !== requestId) return;
      const periodTotal = periodLeadsResult.count || 0;
      updateStats({ totalLeads: totalLeadsResult.count || 0, newToday: periodTotal });
      // Contagem por etapa no servidor (antes: lista limitada a 1000 linhas).
      const stages = stagesResult.data || [];
      const stageCounts = await Promise.all(stages.map(async (stage) => {
        const result = await withTimeout(leadsInPeriod().eq("stage_id", stage.id), "Dashboard:distribuição");
        if (result.error) throw result.error;
        return { name: stage.name, value: result.count || 0 };
      }));
      if (requestIdRef.current !== requestId) return;
      const staged = stageCounts.reduce((total, item) => total + item.value, 0);
      const distribution = [...stageCounts];
      if (periodTotal - staged > 0) distribution.push({ name: "Sem etapa", value: periodTotal - staged });
      setLeadDistribution(distribution.filter((item) => item.value > 0).sort((a, b) => b.value - a.value));
      finishModule("distribution");
    });

    const campaignsPromise = runModule("campaigns", async () => {
      // Campanhas que efetivamente dispararam no período (em andamento, pausadas ou concluídas).
      const result = await withTimeout(
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", effectiveOrganizationId).in("status", SENT_CAMPAIGN_STATUSES).gte("created_at", periodStartIso),
        "Dashboard:campanhas",
      );
      if (result.error) throw result.error;
      if (requestIdRef.current === requestId) updateStats({ campaignsSent: result.count || 0 });
    });

    const messagesPromise = runModule("activity", async () => {
      if (channelIds.length === 0) {
        if (requestIdRef.current === requestId) setRecentActivity([]);
        return;
      }
      const [messagesResult, recentMessagesResult] = await Promise.all([
        // Mais recentes primeiro (antes: as 500 mais ANTIGAS do período, o que congelava o TMR).
        withTimeout(supabase.from("whatsapp_messages").select("direction, sender_phone, created_at").in("channel_id", channelIds).neq("message_type", "system_log").gte("created_at", periodStartIso).order("created_at", { ascending: false }).limit(1000), "Dashboard:tempo de resposta"),
        withTimeout(supabase.from("whatsapp_messages").select("id, sender_name, sender_phone, direction, created_at").in("channel_id", channelIds).neq("message_type", "system_log").gte("created_at", periodStartIso).order("created_at", { ascending: false }).limit(10), "Dashboard:atividade recente"),
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (recentMessagesResult.error) throw recentMessagesResult.error;
      if (requestIdRef.current !== requestId) return;
      const messages = [...(messagesResult.data || [])].reverse();
      const recentMessages = recentMessagesResult.data || [];

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

      updateStats({ avgResponseTime: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0 });
      setRecentActivity(recentMessages.map((message) => ({
        id: message.id,
        type: message.direction === "inbound" ? "message_received" : "message_sent",
        description: message.direction === "inbound"
          ? `Nova mensagem de ${message.sender_name || message.sender_phone || "contato"}`
          : `Mensagem enviada para ${message.sender_phone || message.sender_name || "contato"}`,
        timestamp: message.created_at,
      })));
    });

    await Promise.allSettled([assignmentsPromise, leadsPromise, campaignsPromise, messagesPromise]);
    if (requestIdRef.current === requestId) {
      setLoading(false);
      setModuleLoading(EMPTY_LOADING);
    }
  }, [effectiveOrganizationId, period, updateStats, userId]);

  useEffect(() => {
    if (!authLoading && !organizationLoading) {
      setReadinessTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      requestIdRef.current += 1;
      setLoading(false);
      setModuleLoading(EMPTY_LOADING);
      setReadinessTimedOut(true);
      setError("Não foi possível confirmar sua sessão e o cliente selecionado em 8 segundos.");
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [authLoading, organizationLoading]);

  useEffect(() => {
    if (authLoading || organizationLoading || readinessTimedOut) return;
    if (!userId || !effectiveOrganizationId) {
      requestIdRef.current += 1;
      setLoading(false);
      setModuleLoading(EMPTY_LOADING);
      setError(null);
      return;
    }
    void fetchDashboardData();
  }, [authLoading, effectiveOrganizationId, fetchDashboardData, organizationLoading, readinessTimedOut, userId]);

  // Atualização automática silenciosa (30s e ao voltar para a aba) — antes só atualizava no F5/botão.
  useEffect(() => {
    if (authLoading || organizationLoading || readinessTimedOut || !userId || !effectiveOrganizationId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void fetchDashboardData(true);
    };
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authLoading, effectiveOrganizationId, fetchDashboardData, organizationLoading, readinessTimedOut, userId]);

  const stateData = useMemo(() => [
    { name: "Finalizados", value: stats.resolvedToday, key: "resolved", color: "hsl(var(--success))" },
    { name: "Em atendimento", value: stats.inProgressConversations, key: "active", color: "hsl(var(--info))" },
    { name: "Aguardando", value: stats.pendingConversations, key: "pending", color: "hsl(var(--warning))" },
  ], [stats]);
  const stateTotal = stateData.reduce((total, item) => total + item.value, 0);
  const leadTotal = leadDistribution.reduce((total, item) => total + item.value, 0);
  const maxAttendantTotal = Math.max(...attendantMetrics.map((metric) => metric.inProgress + metric.pending + metric.resolved), 1);
  const hasDailyData = dailyStats.some((day) => day.newConversations > 0 || day.resolved > 0);
  const hasModuleErrors = Object.keys(moduleErrors).length > 0;
  const needsOrganization = !authLoading && !organizationLoading && !!userId && !effectiveOrganizationId;

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

        {needsOrganization && (
          <div role="status" className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
            <span>Selecione um cliente na barra lateral para visualizar a Dashboard.</span>
          </div>
        )}

        {(error || hasModuleErrors) && !needsOrganization && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error || "Alguns módulos não responderam. Os demais dados continuam disponíveis."}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => readinessTimedOut ? window.location.reload() : void fetchDashboardData()}>Tentar novamente</Button>
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
              {moduleLoading.leads ? <Skeleton className="h-12 w-32 bg-primary-foreground/20" /> : <p className="text-4xl font-semibold tabular-nums">{stats.totalLeads.toLocaleString("pt-BR")}</p>}
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
                  {(item.label === "Novos Hoje" ? moduleLoading.leads : item.label === "Campanhas Enviadas" ? moduleLoading.campaigns : moduleLoading.attendance) ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value.toLocaleString("pt-BR")}</p>}
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
              {moduleLoading.activity ? <Skeleton className="h-10 w-28" /> : <p className="text-3xl font-semibold tabular-nums text-foreground">{formatResponseTime(stats.avgResponseTime)}</p>}
              <div className="grid grid-cols-3 gap-2 border-t border-border/70 pt-4">
                {[
                  { label: "Resolvidos Hoje", value: stats.resolvedToday, color: "text-success" },
                  { label: "Pendentes", value: stats.pendingConversations, color: "text-warning" },
                  { label: "Em Andamento", value: stats.inProgressConversations, color: "text-info" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className={cn("text-lg font-semibold tabular-nums", item.color)}>{moduleLoading.attendance ? "—" : item.value}</p>
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
              {moduleLoading.chart ? <ModuleSkeleton chart /> : hasDailyData ? (
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
              {!moduleLoading.chart && hasDailyData && (
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
              {moduleLoading.attendance ? <ModuleSkeleton chart /> : stateTotal > 0 ? (
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
              {moduleLoading.attendance ? <ModuleSkeleton /> : attendantMetrics.length > 0 ? (
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
              {moduleLoading.distribution ? <ModuleSkeleton chart /> : leadTotal > 0 ? (
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
              {moduleLoading.activity ? <ModuleSkeleton /> : recentActivity.length > 0 ? (
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