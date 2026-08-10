import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/export-leads-sem-interacao`;

export function LeadsSemInteracaoExport() {
  const [org, setOrg] = useState("Zentum");
  const [loading, setLoading] = useState<"csv" | "count" | null>(null);
  const [totals, setTotals] = useState<Record<string, unknown> | null>(null);

  const call = async (mode: "csv" | "count") => {
    setLoading(mode);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ org, mode }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      if (mode === "count") {
        const json = await res.json();
        setTotals(json);
        toast.success("Totais calculados");
        return;
      }

      setTotals({
        total_leads: res.headers.get("x-total-leads"),
        total_respondentes: res.headers.get("x-total-respondentes"),
        total_exportados: res.headers.get("x-total-exportados"),
      });

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "leads_sem_interacao.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na exportação");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportar leads sem interação</CardTitle>
        <CardDescription>
          Leads que nunca clicaram nos botões "Quero Consultar", "Não Quero Consultar",
          "Consultar" ou "Não Quero".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="org-name">Organização</Label>
          <Input id="org-name" value={org} onChange={(e) => setOrg(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => call("csv")} disabled={loading !== null}>
            {loading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar CSV
          </Button>
          <Button variant="outline" onClick={() => call("count")} disabled={loading !== null}>
            {loading === "count" && <Loader2 className="h-4 w-4 animate-spin" />}
            Só contar
          </Button>
        </div>
        {totals && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Total de leads: {String(totals.total_leads)}</p>
            <p>Responderam algum botão: {String(totals.total_respondentes)}</p>
            <p>Exportados (sem interação): {String(totals.total_exportados)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
