import { useState, useEffect } from "react";
import { 
  Users, 
  UserPlus, 
  MessageSquare, 
  Send, 
  TrendingUp,
  Clock,
  CheckCircle2,
  Timer,
  UserCheck,
  PhoneCall,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getExternalAssignments } from "@/lib/externalAssignments";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  tone?: "primary" | "success" | "warning" | "accent" | "destructive";
  trend?: number;
  subtitle?: string;
}

const statTones = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  accent: "bg-accent/10 text-accent",
  destructive: "bg-destructive/10 text-destructive",
};

function StatCard({ title, value, icon: Icon, tone = "primary", trend, subtitle }: StatCardProps) {
  return (
    <div className="min-h-[132px] rounded-lg border border-border/80 bg-card p-5 shadow-sm animate-fade-in">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend >= 0 ? "text-success" : "text-destructive"
            )}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{Math.abs(trend)}% vs ontem</span>
            </div>
          )}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", statTones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

interface AttendantMetrics {
  userId: string;
  displayName: string;
  email: string;
  inProgress: number;
  resolved: number;
  avgResponseTime: number;
  isAvailable: boolean;
}

interface DailyStats {
  date: string;
  resolved: number;
  newConversations: number;
}

const Index = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLeads: 0,
    newToday: 0,
    openConversations: 0,
    campaignsSent: 0,
    resolvedToday: 0,
    avgResponseTime: 0,
    pendingConversations: 0,
    inProgressConversations: 0
  });
  const [attendantMetrics, setAttendantMetrics] = useState<AttendantMetrics[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>>([]);

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      fetchDashboardData();
    }
  }, [user, effectiveOrganizationId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const startOfToday = startOfDay(today).toISOString();
      const endOfToday = endOfDay(today).toISOString();

      // Fetch leads count - filtered by organization
      const { count: totalLeads } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", effectiveOrganizationId);

      // Fetch new leads today - filtered by organization
      const { count: newToday } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", effectiveOrganizationId)
        .gte("created_at", startOfToday)
        .lte("created_at", endOfToday);

      // Fetch campaigns sent - filtered by organization
      const { count: campaignsSent } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", effectiveOrganizationId)
        .eq("status", "completed");

      // Fetch channels for this organization to filter messages
      const { data: orgChannels } = await (supabase as any)
        .from("channels_public")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);
      
      const channelIds = orgChannels?.map((c: any) => c.id) || [];

      // Fetch conversation assignments for metrics - filtered by organization's channels (EXTERNAL)
      let assignments: any[] | null = [];
      if (channelIds.length > 0) {
        const ext = await getExternalAssignments();
        const r = await ext
          .from("conversation_assignments")
          .select("*")
          .in("channel_id", channelIds);
        assignments = r.data;
      }

      const openConversations = assignments?.filter(a => a.status === "active" || a.status === "pending").length || 0;
      const pendingConversations = assignments?.filter(a => a.status === "pending").length || 0;
      const inProgressConversations = assignments?.filter(a => a.status === "active").length || 0;
      const resolvedToday = assignments?.filter(a => 
        a.status === "resolved" && 
        a.updated_at >= startOfToday
      ).length || 0;

      // Calculate average response time from messages - filtered by organization's channels
      const { data: messages } = channelIds.length > 0 
        ? await supabase
            .from("whatsapp_messages")
            .select("direction, sender_phone, created_at, channel_id")
            .in("channel_id", channelIds)
            .order("created_at", { ascending: true })
            .limit(500)
        : { data: [] };

      let totalResponseTime = 0;
      let responseCount = 0;
      
      if (messages && messages.length > 0) {
        const messagesByPhone: Record<string, Array<{ direction: string; created_at: string }>> = {};
        messages.forEach(msg => {
          if (!messagesByPhone[msg.sender_phone]) {
            messagesByPhone[msg.sender_phone] = [];
          }
          messagesByPhone[msg.sender_phone].push(msg);
        });

        Object.values(messagesByPhone).forEach(phoneMessages => {
          for (let i = 1; i < phoneMessages.length; i++) {
            if (phoneMessages[i - 1].direction === "inbound" && phoneMessages[i].direction === "outbound") {
              const inboundTime = new Date(phoneMessages[i - 1].created_at).getTime();
              const outboundTime = new Date(phoneMessages[i].created_at).getTime();
              const diff = (outboundTime - inboundTime) / 1000 / 60; // in minutes
              if (diff > 0 && diff < 1440) { // Less than 24 hours
                totalResponseTime += diff;
                responseCount++;
              }
            }
          }
        });
      }

      const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;

      setStats({
        totalLeads: totalLeads || 0,
        newToday: newToday || 0,
        openConversations,
        campaignsSent: campaignsSent || 0,
        resolvedToday,
        avgResponseTime,
        pendingConversations,
        inProgressConversations
      });

      // Fetch attendant availability and metrics - filtered by organization
      const { data: availability } = await supabase
        .from("attendant_availability")
        .select("*")
        .eq("organization_id", effectiveOrganizationId);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("organization_id", effectiveOrganizationId);

      if (availability && profiles) {
        const metricsMap: Record<string, AttendantMetrics> = {};
        
        profiles.forEach(profile => {
          metricsMap[profile.user_id] = {
            userId: profile.user_id,
            displayName: profile.display_name || profile.email || "Atendente",
            email: profile.email || "",
            inProgress: 0,
            resolved: 0,
            avgResponseTime: 0,
            isAvailable: false
          };
        });

        availability.forEach(a => {
          if (metricsMap[a.user_id]) {
            metricsMap[a.user_id].isAvailable = a.is_available || false;
            metricsMap[a.user_id].inProgress = a.current_conversations || 0;
          }
        });

        // Count resolved conversations per attendant
        if (assignments) {
          assignments.forEach(assignment => {
            if (assignment.assigned_to && metricsMap[assignment.assigned_to]) {
              if (assignment.status === "resolved") {
                metricsMap[assignment.assigned_to].resolved++;
              }
            }
          });
        }

        setAttendantMetrics(Object.values(metricsMap).filter(m => m.inProgress > 0 || m.resolved > 0 || m.isAvailable));
      }

      // Generate daily stats for last 7 days
      const last7Days: DailyStats[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dayStart = startOfDay(date).toISOString();
        const dayEnd = endOfDay(date).toISOString();
        
        const resolved = assignments?.filter(a => 
          a.status === "resolved" && 
          a.updated_at >= dayStart && 
          a.updated_at <= dayEnd
        ).length || 0;

        const newConvs = assignments?.filter(a => 
          a.created_at >= dayStart && 
          a.created_at <= dayEnd
        ).length || 0;

        last7Days.push({
          date: format(date, "EEE", { locale: ptBR }),
          resolved,
          newConversations: newConvs
        });
      }
      setDailyStats(last7Days);

      // Fetch recent activity - filtered by organization's channels
      const { data: recentMessages } = channelIds.length > 0 
        ? await supabase
            .from("whatsapp_messages")
            .select("id, sender_name, sender_phone, direction, created_at")
            .in("channel_id", channelIds)
            .order("created_at", { ascending: false })
            .limit(10)
        : { data: [] };

      if (recentMessages) {
        const activity = recentMessages.map(msg => ({
          id: msg.id,
          type: msg.direction === "inbound" ? "message_received" : "message_sent",
          description: msg.direction === "inbound" 
            ? `Nova mensagem de ${msg.sender_name || msg.sender_phone}`
            : `Mensagem enviada para ${msg.sender_phone}`,
          timestamp: msg.created_at
        }));
        setRecentActivity(activity);
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const maxResolved = Math.max(...dailyStats.map(d => d.resolved), 1);

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visão geral do seu CRM WhatsApp</p>
      </div>

      {/* KPI Grid */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total de Leads"
          value={stats.totalLeads}
          icon={Users}
          tone="primary"
        />
        <StatCard
          title="Novos Hoje"
          value={stats.newToday}
          icon={UserPlus}
          tone="success"
        />
        <StatCard
          title="Conversas Abertas"
          value={stats.openConversations}
          icon={MessageSquare}
          tone="accent"
        />
        <StatCard
          title="Campanhas Enviadas"
          value={stats.campaignsSent}
          icon={Send}
          tone="primary"
        />
        <StatCard
          title="Tempo Médio de Resposta"
          value={formatTime(stats.avgResponseTime)}
          icon={Timer}
          tone="warning"
          subtitle="Primeira resposta"
        />
        <StatCard
          title="Resolvidos Hoje"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          title="Pendentes"
          value={stats.pendingConversations}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          title="Em Andamento"
          value={stats.inProgressConversations}
          icon={PhoneCall}
          tone="accent"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Daily Resolution Chart */}
        <Card className="border-border/80 shadow-sm lg:col-span-2 animate-slide-up">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold">Atendimentos por Dia</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="mt-2 flex h-44 items-end justify-between gap-3 rounded-lg bg-muted/20 px-4 pt-5">
              {dailyStats.map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {day.resolved}
                    </span>
                    <div 
                      className="w-full rounded-t-md bg-primary/70 transition-colors duration-300 hover:bg-primary"
                      style={{ 
                        height: `${Math.max((day.resolved / maxResolved) * 100, 8)}px`,
                        minHeight: "8px"
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{day.date}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-primary" />
                <span className="text-xs text-muted-foreground">Resolvidos</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/80 shadow-sm animate-slide-up">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold">Resumo do Dia</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3.5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-success/10 p-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">Finalizados</p>
                  <p className="text-xs text-muted-foreground">Hoje</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-foreground">{stats.resolvedToday}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3.5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <PhoneCall className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">Em Atendimento</p>
                  <p className="text-xs text-muted-foreground">Agora</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-foreground">{stats.inProgressConversations}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3.5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-warning/15 p-2">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-medium">Aguardando</p>
                  <p className="text-xs text-muted-foreground">Na fila</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-foreground">{stats.pendingConversations}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Attendant Performance */}
        <Card className="border-border/80 shadow-sm animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold">Desempenho por Atendente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {attendantMetrics.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-4">
                  {attendantMetrics.map((attendant) => (
                    <div key={attendant.userId} className="rounded-lg border border-border/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {attendant.displayName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{attendant.displayName}</p>
                            <p className="text-xs text-muted-foreground">{attendant.email}</p>
                          </div>
                        </div>
                        <Badge variant={attendant.isAvailable ? "default" : "secondary"} className="text-xs">
                          {attendant.isAvailable ? "Disponível" : "Ocupado"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="rounded-md bg-muted/30 p-2.5">
                          <p className="text-lg font-semibold text-accent">{attendant.inProgress}</p>
                          <p className="text-xs text-muted-foreground">Em Andamento</p>
                        </div>
                        <div className="rounded-md bg-muted/30 p-2.5">
                          <p className="text-lg font-semibold text-success">{attendant.resolved}</p>
                          <p className="text-xs text-muted-foreground">Finalizados</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserCheck className="w-12 h-12 mb-4 opacity-30" />
                <p>Nenhum atendente encontrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border/80 shadow-sm animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-foreground" />
              <CardTitle className="text-base font-semibold">Atividade Recente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 rounded-lg border-b border-border/50 p-3 last:border-b-0 hover:bg-muted/30 transition-colors">
                      <div className={cn(
                        "p-1.5 rounded-full mt-0.5",
                        activity.type === "message_received" ? "bg-success/10" : "bg-accent/10"
                      )}>
                        <MessageSquare className={cn(
                          "w-3 h-3",
                          activity.type === "message_received" ? "text-success" : "text-accent"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.timestamp), "HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                <p>Nenhuma atividade recente</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Index;
