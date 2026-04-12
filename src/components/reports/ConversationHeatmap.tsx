import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { useConversationHeatmap } from "@/hooks/useConversationHeatmap";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function getHeatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-muted/40";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/75";
  if (ratio > 0.25) return "bg-primary/50";
  return "bg-primary/25";
}

export function ConversationHeatmap() {
  const [daysBack, setDaysBack] = useState(7);
  const { loading, data } = useConversationHeatmap(daysBack);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Tráfego de conversa</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold">Tráfego de conversa</CardTitle>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 inline-block" />
            Em tempo real
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {availableButtons.length > 0 && (
            <Select value={buttonFilter || "all"} onValueChange={(v) => setButtonFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Todos os botões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os botões</SelectItem>
                {availableButtons.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(daysBack)} onValueChange={(v) => setDaysBack(Number(v))}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={100}>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {data.days.map((day, dayIdx) => (
                <div key={day.date} className="flex items-center gap-1 mb-1">
                  <div className="w-28 text-xs text-right pr-2 flex-shrink-0">
                    <span className="font-medium">{day.label}</span>
                    <br />
                    <span className="text-muted-foreground">
                      {format(new Date(day.date + "T12:00:00"), "MMM d, yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  {hours.map(h => {
                    const cell = data.cells.find(c => c.day === dayIdx && c.hour === h);
                    const count = cell?.count || 0;
                    return (
                      <Tooltip key={h}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "w-[calc((100%-7rem-1.5rem)/24)] aspect-square rounded-sm cursor-default transition-colors min-w-[18px]",
                              getHeatColor(count, data.maxCount)
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <p className="font-semibold">{count} conversa{count !== 1 ? "s" : ""}</p>
                          <p className="text-muted-foreground">{day.label} às {String(h).padStart(2, "0")}:00</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
              {/* Hour labels */}
              <div className="flex items-center gap-1 mt-2">
                <div className="w-28 flex-shrink-0" />
                {hours.map(h => (
                  <div key={h} className="w-[calc((100%-7rem-1.5rem)/24)] text-center text-[10px] text-muted-foreground min-w-[18px]">
                    {h}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
