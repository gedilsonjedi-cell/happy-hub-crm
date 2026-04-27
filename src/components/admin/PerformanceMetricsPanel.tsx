import { useEffect, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Cpu,
  Gauge,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";
import {
  bucketAvgSwitch,
  bucketHitRate,
  getSnapshot,
  percentile,
  refreshSnapshot,
  resetMetrics,
  subscribe,
  type PerfMetricsSnapshot,
  type TierBucket,
} from "@/lib/perfMetrics";
import type { PerfTier } from "@/lib/devicePerformance";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<PerfTier, { label: string; color: string; description: string }> = {
  low: {
    label: "Máquinas fracas",
    color: "text-red-500 bg-red-500/10 border-red-500/30",
    description: "CPU/RAM limitada, rede ruim ou modo economia",
  },
  medium: {
    label: "Máquinas médias",
    color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    description: "Notebooks padrão, internet 4G/cabo",
  },
  high: {
    label: "Máquinas potentes",
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    description: "Desktops modernos com rede estável",
  },
};

function formatMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatRelative(ts: number): string {
  if (!ts) return "sem dados";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "agora";
  if (diff < 3600_000) return `há ${Math.round(diff / 60_000)} min`;
  if (diff < 86400_000) return `há ${Math.round(diff / 3600_000)} h`;
  return `há ${Math.round(diff / 86400_000)} d`;
}

function TierCard({ bucket }: { bucket: TierBucket }) {
  const meta = TIER_LABELS[bucket.tier];
  const avg = bucketAvgSwitch(bucket);
  const p50 = percentile(bucket.switchSamples, 50);
  const p95 = percentile(bucket.switchSamples, 95);
  const hit = bucketHitRate(bucket);
  const totalSelections = bucket.prefetchHits + bucket.prefetchMisses;

  // Color the avg latency: green <250ms, amber <800ms, red beyond
  const latencyTone =
    avg === 0
      ? "text-muted-foreground"
      : avg < 250
        ? "text-emerald-500"
        : avg < 800
          ? "text-amber-500"
          : "text-red-500";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{meta.label}</CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </div>
          <Badge variant="outline" className={cn("uppercase tracking-wide", meta.color)}>
            {bucket.tier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Tempo médio</div>
            <div className={cn("text-xl font-bold", latencyTone)}>{formatMs(avg)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Mediana (p50)</div>
            <div className="text-xl font-bold">{formatMs(p50)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Pior caso (p95)</div>
            <div className="text-xl font-bold">{formatMs(p95)}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Cache hit rate (pré-carregamento)</span>
            <span className="font-medium">
              {totalSelections > 0 ? formatPct(hit) : "—"}
            </span>
          </div>
          <Progress value={hit * 100} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>{bucket.prefetchHits} hits</span>
            <span>{bucket.prefetchMisses} misses</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-blue-500" />
            <div>
              <div className="text-xs text-muted-foreground">Trocas</div>
              <div className="font-semibold">{bucket.switchCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-500" />
            <div>
              <div className="text-xs text-muted-foreground">Pré-carregamentos</div>
              <div className="font-semibold">{bucket.prefetchAttempts}</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground border-t pt-2">
          Última amostra: {formatRelative(bucket.lastUpdated)}
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceMetricsPanel() {
  // Re-render whenever the tracker fires
  const snap = useSyncExternalStore<PerfMetricsSnapshot>(
    (cb) => subscribe(cb),
    () => getSnapshot(),
    () => getSnapshot()
  );
  const [, setTick] = useState(0);

  // Light heartbeat so "última amostra: há X min" stays fresh
  useEffect(() => {
    const id = setInterval(() => {
      refreshSnapshot();
      setTick((t) => t + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const tierMeta = TIER_LABELS[snap.deviceTier];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5" />
                Performance do Atendimento
              </CardTitle>
              <CardDescription>
                Tempo de troca de cliente, pré-carregamentos e taxa de cache hit, agregados por
                tier do dispositivo. Os dados são coletados localmente em cada máquina.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { refreshSnapshot(); setTick((t) => t + 1); }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Limpar todas as métricas coletadas neste navegador?")) {
                    resetMetrics();
                  }
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Resetar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="p-2 rounded-md bg-primary/10">
                <Cpu className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tier deste dispositivo</div>
                <Badge variant="outline" className={cn("mt-1", tierMeta.color)}>
                  {tierMeta.label}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="p-2 rounded-md bg-blue-500/10">
                <Activity className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CPU lógica</div>
                <div className="font-semibold">
                  {snap.cores ? `${snap.cores} núcleos` : "n/d"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="p-2 rounded-md bg-emerald-500/10">
                <Target className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Memória estimada</div>
                <div className="font-semibold">
                  {snap.memoryGb != null ? `${snap.memoryGb} GB` : "n/d"}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground break-words">
            <span className="font-medium">User-Agent:</span> {snap.userAgent || "—"}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <TierCard bucket={snap.buckets.low} />
        <TierCard bucket={snap.buckets.medium} />
        <TierCard bucket={snap.buckets.high} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como interpretar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Tempo de troca</strong>: tempo entre o clique no contato e a primeira renderização das mensagens.
            Abaixo de 250 ms é instantâneo, entre 250–800 ms é aceitável, acima disso o cliente percebe lentidão.
          </p>
          <p>
            <strong className="text-foreground">Cache hit rate</strong>: % de aberturas onde as mensagens já estavam em cache (pré-carregadas). Quanto maior, mais "instantâneo" o sistema parece.
          </p>
          <p>
            <strong className="text-foreground">Pré-carregamentos</strong>: quantas requisições preditivas foram disparadas em background. O budget é adaptado automaticamente por tier — máquinas fracas recebem menos.
          </p>
          <p>
            Os dados ficam armazenados apenas neste navegador. Para diagnosticar a máquina de um cliente, peça para ele abrir esta tela após usar o sistema por alguns minutos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
