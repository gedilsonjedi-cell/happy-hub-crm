import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, MousePointerClick } from "lucide-react";
import { useButtonTrafficHeatmap } from "@/hooks/useButtonTrafficHeatmap";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function getHeatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-muted/40";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-amber-500";
  if (ratio > 0.5) return "bg-amber-400/80";
  if (ratio > 0.25) return "bg-amber-300/60";
  return "bg-amber-200/40";
}

export function ButtonTrafficHeatmap() {
  const [daysBack, setDaysBack] = useState(7);
  const [selectedButton, setSelectedButton] = useState<string | undefined>(undefined);
  const { loading, data, availableButtons } = useButtonTrafficHeatmap(daysBack, selectedButton);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <MousePointerClick className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-lg font-semibold">Tráfego por botão</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
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
          <MousePointerClick className="w-5 h-5 text-amber-500" />
          <CardTitle className="text-lg font-semibold">Tráfego por botão</CardTitle>
          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 inline-block" />
            Interações
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedButton || "all"}
            onValueChange={(v) => setSelectedButton(v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Selecione um botão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os botões</SelectItem>
              {availableButtons.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        {availableButtons.length === 0 && !loading ? (
          <div className="text-center py-10 text-muted-foreground">
            <MousePointerClick className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma interação de botão encontrada</p>
            <p className="text-sm mt-1">As interações aparecerão aqui quando leads clicarem em botões de templates</p>
          </div>
        ) : (
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
                            <p className="font-semibold">{count} clique{count !== 1 ? "s" : ""}</p>
                            <p className="text-muted-foreground">{day.label} às {String(h).padStart(2, "0")}:00</p>
                            {selectedButton && <p className="text-amber-500 font-medium">Botão: {selectedButton}</p>}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    <div className="min-w-[40px] text-center text-xs font-semibold text-foreground flex items-center justify-center">
                      {data.cells.filter(c => c.day === dayIdx).reduce((sum, c) => sum + c.count, 0)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-28 flex-shrink-0" />
                  {hours.map(h => (
                    <div key={h} className="w-[calc((100%-7rem-1.5rem)/24)] text-center text-[10px] text-muted-foreground min-w-[18px]">
                      {h}
                    </div>
                  ))}
                  <div className="min-w-[40px] text-center text-[10px] text-muted-foreground font-semibold">Total</div>
                </div>
              </div>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
