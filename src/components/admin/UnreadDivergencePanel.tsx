import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PerUser {
  user_id: string | null;
  unread_real: number;
  unread_persisted: number;
  divergence: number;
}
interface OrgReport {
  organization_id: string;
  organization_name?: string | null;
  total_active: number;
  novos: number;
  unread_real: number;
  unread_persisted: number;
  divergence_real_vs_persisted: number;
  divergence_novos_gt_unread: number;
  per_user: PerUser[];
}

export function UnreadDivergencePanel() {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<OrgReport[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [onlyAlerts, setOnlyAlerts] = useState(true);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("diag-unread-divergence", {
        body: {},
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha desconhecida");
      setReports(data.reports as OrgReport[]);
      setGeneratedAt(data.generated_at);
      const total = data.total_alerts as number;
      if (total > 0) {
        toast.warning(`${total} organização(ões) com divergência detectada`);
      } else {
        toast.success("Nenhuma divergência detectada");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = reports?.filter(r =>
    !onlyAlerts || r.divergence_real_vs_persisted > 0 || r.divergence_novos_gt_unread > 0
  ) ?? [];

  const totalAlerts = reports?.filter(
    r => r.divergence_real_vs_persisted > 0 || r.divergence_novos_gt_unread > 0
  ).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Diagnóstico Não Lidos × Novos
        </CardTitle>
        <CardDescription>
          Compara o que o app mostra como "Não Lidos" (real) vs o que está persistido em
          conversation_stats, e valida que "Novos" ⊆ "Não Lidos".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Executar varredura
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOnlyAlerts(v => !v)}>
            {onlyAlerts ? "Mostrar todas as orgs" : "Apenas com divergência"}
          </Button>
          {generatedAt && (
            <span className="text-xs text-muted-foreground">
              Última execução: {new Date(generatedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        {reports && (
          <Alert variant={totalAlerts > 0 ? "destructive" : "default"}>
            {totalAlerts > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <AlertTitle>
              {totalAlerts > 0
                ? `${totalAlerts} organização(ões) com divergência`
                : "Tudo consistente"}
            </AlertTitle>
            <AlertDescription>
              {totalAlerts > 0
                ? "Conferir abaixo. 'Δ real×persistido' indica stats fora de sincronia. 'Novos>Não lidos' nunca deve ocorrer."
                : `${reports.length} organização(ões) avaliada(s).`}
            </AlertDescription>
          </Alert>
        )}

        {filtered.length > 0 && (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead className="text-right">Ativas</TableHead>
                  <TableHead className="text-right">Novos</TableHead>
                  <TableHead className="text-right">Não lidos (real)</TableHead>
                  <TableHead className="text-right">Não lidos (persist.)</TableHead>
                  <TableHead className="text-right">Δ real×persist.</TableHead>
                  <TableHead className="text-right">Novos&gt;Não lidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const hasIssue = r.divergence_real_vs_persisted > 0 || r.divergence_novos_gt_unread > 0;
                  return (
                    <TableRow key={r.organization_id} className={hasIssue ? "bg-destructive/5" : ""}>
                      <TableCell className="font-medium">
                        {r.organization_name || r.organization_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right">{r.total_active}</TableCell>
                      <TableCell className="text-right">{r.novos}</TableCell>
                      <TableCell className="text-right">{r.unread_real}</TableCell>
                      <TableCell className="text-right">{r.unread_persisted}</TableCell>
                      <TableCell className="text-right">
                        {r.divergence_real_vs_persisted > 0 ? (
                          <Badge variant="destructive">{r.divergence_real_vs_persisted}</Badge>
                        ) : "0"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.divergence_novos_gt_unread > 0 ? (
                          <Badge variant="destructive">{r.divergence_novos_gt_unread}</Badge>
                        ) : "0"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {filtered.some(r => r.per_user.length > 0) && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Por atendente (orgs com divergência)</h4>
            {filtered
              .filter(r => r.per_user.some(u => u.divergence > 0))
              .map(r => (
                <div key={r.organization_id} className="border rounded-md p-3">
                  <div className="text-sm font-medium mb-2">
                    {r.organization_name || r.organization_id.slice(0, 8)}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Atendente (user_id)</TableHead>
                        <TableHead className="text-right">Real</TableHead>
                        <TableHead className="text-right">Persistido</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.per_user.filter(u => u.divergence > 0).map(u => (
                        <TableRow key={(u.user_id ?? "none") + r.organization_id}>
                          <TableCell className="font-mono text-xs">
                            {u.user_id || <em>sem atendente</em>}
                          </TableCell>
                          <TableCell className="text-right">{u.unread_real}</TableCell>
                          <TableCell className="text-right">{u.unread_persisted}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive">{u.divergence}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
