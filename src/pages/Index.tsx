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
import { useAuth } from "@/hooks/useAuth";
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
  iconColor?: string;
  trend?: number;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, iconColor = "text-primary", trend, subtitle }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend >= 0 ? "text-emerald-500" : "text-destructive"
            )}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{Math.abs(trend)}% vs ontem</span>
            </div>
          )}
        </div>
        <div className={cn("p-2 rounded-lg bg-primary/10", iconColor.replace("text-", "bg-").replace("text-", "") + "/10")}>
          <Icon className={cn("w-5 h-5", iconColor)} />
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
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const startOfToday = startOfDay(today).toISOString();
      const endOfToday = endOfDay(today).toISOString();

      // Fetch leads count
      const { count: totalLeads } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true });

      // Fetch new leads today
      const { count: newToday } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfToday)
        .lte("created_at", endOfToday);

      // Fetch campaigns sent
      const { count: campaignsSent } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");

      // Fetch conversation assignments for metrics
      const { data: assignments } = await supabase
        .from("conversation_assignments")
        .select("*");

      const openConversations = assignments?.filter(a => a.status === "active" || a.status === "pending").length || 0;
      const pendingConversations = assignments?.filter(a => a.status === "pending").length || 0;
      const inProgressConversations = assignments?.filter(a => a.status === "active").length || 0;
      const resolvedToday = assignments?.filter(a => 
        a.status === "resolved" && 
        a.updated_at >= startOfToday
      ).length || 0;

      // Calculate average response time from messages
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("direction, sender_phone, created_at")
        .order("created_at", { ascending: true })
        .limit(500);

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

      // Fetch attendant availability and metrics
      const { data: availability } = await supabase
        .from("attendant_availability")
        .select("*");

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");

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

      // Fetch recent activity
      const { data: recentMessages } = await supabase
        .from("whatsapp_messages")
        .select("id, sender_name, sender_phone, direction, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

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
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard CRM</h1>
        <p className="text-muted-foreground">Visão geral do seu CRM WhatsApp</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total de Leads"
          value={stats.totalLeads}
          icon={Users}
          iconColor="text-primary"
        />
        <StatCard
          title="Novos Hoje"
          value={stats.newToday}
          icon={UserPlus}
          iconColor="text-emerald-500"
        />
        <StatCard
          title="Conversas Abertas"
          value={stats.openConversations}
          icon={MessageSquare}
          iconColor="text-blue-500"
        />
        <StatCard
          title="Campanhas Enviadas"
          value={stats.campaignsSent}
          icon={Send}
          iconColor="text-purple-500"
        />
      </div>

      {/* Support Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Tempo Médio de Resposta"
          value={formatTime(stats.avgResponseTime)}
          icon={Timer}
          iconColor="text-amber-500"
          subtitle="Primeira resposta"
        />
        <StatCard
          title="Resolvidos Hoje"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
        />
        <StatCard
          title="Pendentes"
          value={stats.pendingConversations}
          icon={Clock}
          iconColor="text-orange-500"
        />
        <StatCard
          title="Em Andamento"
          value={stats.inProgressConversations}
          icon={PhoneCall}
          iconColor="text-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Daily Resolution Chart */}
        <Card className="lg:col-span-2 animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Atendimentos por Dia</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-40 mt-4">
              {dailyStats.map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {day.resolved}
                    </span>
                    <div 
                      className="w-full bg-primary/80 rounded-t-sm transition-all duration-300 hover:bg-primary"
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
        <Card className="animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Resumo do Dia</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Finalizados</p>
                  <p className="text-xs text-muted-foreground">Hoje</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-foreground">{stats.resolvedToday}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <PhoneCall className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Em Atendimento</p>
                  <p className="text-xs text-muted-foreground">Agora</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-foreground">{stats.inProgressConversations}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Clock className="w-4 h-4 text-orange-500" />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendant Performance */}
        <Card className="animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Desempenho por Atendente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {attendantMetrics.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-4">
                  {attendantMetrics.map((attendant) => (
                    <div key={attendant.userId} className="p-3 bg-muted/30 rounded-lg">
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
                        <div className="p-2 bg-background rounded">
                          <p className="text-lg font-bold text-blue-500">{attendant.inProgress}</p>
                          <p className="text-xs text-muted-foreground">Em Andamento</p>
                        </div>
                        <div className="p-2 bg-background rounded">
                          <p className="text-lg font-bold text-emerald-500">{attendant.resolved}</p>
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
        <Card className="animate-slide-up">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-foreground" />
              <CardTitle className="text-lg">Atividade Recente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                      <div className={cn(
                        "p-1.5 rounded-full mt-0.5",
                        activity.type === "message_received" ? "bg-emerald-500/10" : "bg-blue-500/10"
                      )}>
                        <MessageSquare className={cn(
                          "w-3 h-3",
                          activity.type === "message_received" ? "text-emerald-500" : "text-blue-500"
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
