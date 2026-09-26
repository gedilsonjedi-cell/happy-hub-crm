import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useCampaignTraffic } from "@/hooks/useCampaignTraffic";
import { Megaphone, Send, CheckCircle2, Eye, MousePointerClick, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type StatusFilter = "all" | "delivered_only";

function statusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge className="bg-success/10 text-success border-0 text-[0.625rem]">Concluída</Badge>;
    case "processing": return <Badge className="bg-info/10 text-info border-0 text-[0.625rem]">Em andamento</Badge>;
    case "paused": return <Badge className="bg-warning/10 text-warning border-0 text-[0.625rem]">Pausada</Badge>;
    case "scheduled": return <Badge className="bg-chart-3/10 text-chart-3 border-0 text-[0.625rem]">Agendada</Badge>;
    default: return <Badge variant="outline" className="text-[0.625rem]">{status}</Badge>;
  }
}

export function CampaignTrafficPanel() {
  const { campaigns, loading } = useCampaignTraffic();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const totalDelivered = useMemo(
    () => campaigns.reduce((acc, c) => acc + (c.deliveredCount || 0) + (c.readCount || 0), 0),
    [campaigns]
  );
  const totalSent = useMemo(
    () => campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0),
    [campaigns]
  );

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Tráfego por campanha</CardTitle></CardHeader>
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold">Tráfego por campanha</CardTitle>
            <Badge variant="outline" className="text-xs">Últimas 20</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "delivered_only" ? "default" : "outline"}
              onClick={() => setStatusFilter("delivered_only")}
            >
              Somente entregues
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm">
          {statusFilter === "all" ? (
            <>
              <div className="flex items-center gap-1.5">
                <Send className="w-4 h-4 text-info" />
                <span className="text-muted-foreground">Enviados:</span>
                <span className="font-semibold">{totalSent.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-muted-foreground">Entregues:</span>
                <span className="font-semibold">{totalDelivered.toLocaleString("pt-BR")}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-muted-foreground">Total entregues (delivered + read):</span>
              <span className="font-semibold text-success">{totalDelivered.toLocaleString("pt-BR")}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma campanha encontrada</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const deliveryRate = campaign.totalRecipients > 0
                ? Math.round((campaign.deliveredCount / campaign.totalRecipients) * 100)
                : 0;
              const readRate = campaign.deliveredCount > 0
                ? Math.round((campaign.readCount / campaign.deliveredCount) * 100)
                : 0;

              return (
                <div key={campaign.id} className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-md bg-primary/10">
                        <Megaphone className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-sm truncate">{campaign.name}</span>
                      {statusBadge(campaign.status)}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {format(new Date(campaign.createdAt), "dd MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>

                  {/* Delivery progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Entrega</span>
                      <span className="font-medium">{deliveryRate}%</span>
                    </div>
                    <Progress value={deliveryRate} className="h-1.5" />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {statusFilter === "all" && (
                      <div className="flex items-center gap-1.5 text-xs">
                      <Send className="w-3.5 h-3.5 text-info" />
                        <div>
                          <div className="font-semibold">{campaign.sentCount}</div>
                          <div className="text-muted-foreground">Enviados</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <div>
                        <div className="font-semibold">{campaign.deliveredCount + campaign.readCount}</div>
                        <div className="text-muted-foreground">Entregues</div>
                      </div>
                    </div>
                    {statusFilter === "all" && (
                      <>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Eye className="w-3.5 h-3.5 text-chart-3" />
                          <div>
                            <div className="font-semibold">{campaign.readCount}</div>
                            <div className="text-muted-foreground">Lidos ({readRate}%)</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <MousePointerClick className="w-3.5 h-3.5 text-warning" />
                          <div>
                            <div className="font-semibold">{campaign.interactedCount}</div>
                            <div className="text-muted-foreground">Cliques</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                          <div>
                            <div className="font-semibold">{campaign.failedCount}</div>
                            <div className="text-muted-foreground">Falhas</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
