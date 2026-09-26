import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Timer, 
  Clock, 
  Hourglass, 
  Users, 
  Building2, 
  TrendingUp,
  CheckCircle2,
  MessageSquare
} from "lucide-react";
import { useConversationMetrics } from "@/hooks/useConversationMetrics";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  trend?: number;
}

function MetricCard({ title, value, subtitle, icon: Icon, iconColor = "text-primary", trend }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("p-2 rounded-lg", iconColor.replace("text-", "bg-") + "/10")}>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 mt-2 text-xs font-medium",
            trend >= 0 ? "text-success" : "text-destructive"
          )}>
            <TrendingUp className={cn("w-3 h-3", trend < 0 && "rotate-180")} />
            <span>{Math.abs(trend)}% vs semana anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConversationMetricsPanel() {
  const { loading, summary, byAttendant, bySector, formatTime } = useConversationMetrics();
  const [activeTab, setActiveTab] = useState("overview");

  const maxAttendantConversations = Math.max(...byAttendant.map(a => a.conversationCount), 1);
  const maxSectorConversations = Math.max(...bySector.map(s => s.conversationCount), 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="TMR - Tempo Médio de Resposta"
          value={formatTime(summary.avgFirstResponseTime)}
          subtitle="Primeira resposta ao cliente"
          icon={Timer}
          iconColor="text-info"
        />
        <MetricCard
          title="TMA - Tempo Médio de Atendimento"
          value={formatTime(summary.avgHandlingTime)}
          subtitle="Duração total da conversa"
          icon={Clock}
          iconColor="text-chart-3"
        />
        <MetricCard
          title="TME - Tempo Médio de Espera"
          value={formatTime(summary.avgWaitTime)}
          subtitle="Cliente aguardando na fila"
          icon={Hourglass}
          iconColor="text-chart-4"
        />
        <MetricCard
          title="Resolvidos Hoje"
          value={summary.resolvedToday.toString()}
          subtitle={`de ${summary.totalConversations} conversas`}
          icon={CheckCircle2}
          iconColor="text-success"
        />
      </div>

      {/* Detailed Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Métricas Detalhadas
          </CardTitle>
          <CardDescription>
            Análise de performance por atendente e departamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="attendants" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Por Atendente
              </TabsTrigger>
              <TabsTrigger value="sectors" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Por Departamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attendants" className="space-y-4">
              {byAttendant.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma métrica de atendente disponível</p>
                </div>
              ) : (
                byAttendant.map((attendant) => (
                  <div 
                    key={attendant.userId} 
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {attendant.displayName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{attendant.displayName}</span>
                        {attendant.isAvailable ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-neutral/10 text-neutral border-neutral/30">
                            Offline
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Timer className="w-3 h-3 text-info" />
                          TMR: {formatTime(attendant.avgFirstResponseTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-chart-3" />
                          TMA: {formatTime(attendant.avgHandlingTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-success" />
                          {attendant.resolvedCount} resolvidos
                        </span>
                      </div>
                      
                      <div className="mt-2">
                        <Progress 
                          value={(attendant.conversationCount / maxAttendantConversations) * 100} 
                          className="h-1.5" 
                        />
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-bold">{attendant.conversationCount}</div>
                      <div className="text-xs text-muted-foreground">conversas</div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="sectors" className="space-y-4">
              {bySector.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma métrica de departamento disponível</p>
                </div>
              ) : (
                bySector.map((sector) => (
                  <div 
                    key={sector.sectorId} 
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium mb-1">{sector.sectorName}</div>
                      
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Timer className="w-3 h-3 text-info" />
                          TMR: {formatTime(sector.avgFirstResponseTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-chart-3" />
                          TMA: {formatTime(sector.avgHandlingTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Hourglass className="w-3 h-3 text-chart-4" />
                          TME: {formatTime(sector.avgWaitTime)}
                        </span>
                      </div>
                      
                      <div className="mt-2">
                        <Progress 
                          value={(sector.conversationCount / maxSectorConversations) * 100} 
                          className="h-1.5" 
                        />
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-bold">{sector.conversationCount}</div>
                      <div className="text-xs text-muted-foreground">conversas</div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
