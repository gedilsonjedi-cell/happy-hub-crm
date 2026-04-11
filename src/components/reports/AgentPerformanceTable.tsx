import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAgentPerformance } from "@/hooks/useAgentPerformance";
import { Users } from "lucide-react";

export function AgentPerformanceTable() {
  const { agents, loading } = useAgentPerformance();

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Conversas por agentes</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold">Conversas por agentes</CardTitle>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 inline-block" />
            Em tempo real
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhum agente encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">Agente</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-muted-foreground">Abertas</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-muted-foreground">Não atendidas</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-muted-foreground">Resolvidas</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.userId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-medium">
                            {agent.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{agent.displayName}</span>
                            {agent.isAvailable && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">{agent.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="text-lg font-semibold">{agent.openCount}</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="text-lg font-semibold text-orange-500">{agent.unattendedCount}</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="text-lg font-semibold text-emerald-600">{agent.resolvedCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
