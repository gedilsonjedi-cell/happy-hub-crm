import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

const FUNCTIONS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/export-leads-sem-interacao`;

type ExportType = "sem_interacao" | "base_toda";
type DateField = "created" | "last_interaction";

export function LeadsSemInteracaoExport() {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState<"csv" | "count" | null>(null);
  const [totals, setTotals] = useState<Record<string, unknown> | null>(null);
  const [exportType, setExportType] = useState<ExportType>("sem_interacao");
  const [dateField, setDateField] = useState<DateField>("created");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let active = true;
    if (!effectiveOrganizationId) {
      setOrgName("");
      return;
    }
    supabase
      .from("organizations")
      .select("name")
      .eq("id", effectiveOrganizationId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setOrgName(data?.name || "");
      });
    return () => {
      active = false;
    };
  }, [effectiveOrganizationId]);

  const call = async (mode: "csv" | "count") => {
    if (!effectiveOrganizationId) {
      toast.error("Nenhuma organização ativa. Selecione um cliente primeiro.");
      return;
    }
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
        body: JSON.stringify({
          organization_id: effectiveOrganizationId,
          mode,
          export_type: exportType,
          date_field: dateField,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
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
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "leads_export.csv";
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
        <CardTitle>Exportar Leads</CardTitle>
        <CardDescription>
          Exporte a base completa ou apenas os leads que nunca clicaram nos botões
          "Quero Consultar", "Não Quero Consultar", "Consultar" ou "Não Quero".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="text-sm">
          <span className="text-muted-foreground">Organização atual: </span>
          <span className="font-medium">
            {orgName || (effectiveOrganizationId ? "Carregando..." : "Nenhuma organização selecionada")}
          </span>
          {isImpersonating && (
            <span className="text-muted-foreground"> (impersonando)</span>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tipo de exportação</Label>
          <RadioGroup
            value={exportType}
            onValueChange={(v) => setExportType(v as ExportType)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="sem_interacao" id="exp-sem" />
              <Label htmlFor="exp-sem" className="font-normal">Só sem interação</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="base_toda" id="exp-todos" />
              <Label htmlFor="exp-todos" className="font-normal">Base toda</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Filtrar período por</Label>
          <RadioGroup
            value={dateField}
            onValueChange={(v) => setDateField(v as DateField)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="created" id="df-created" />
              <Label htmlFor="df-created" className="font-normal">Data de criação do lead</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="last_interaction" id="df-last" />
              <Label htmlFor="df-last" className="font-normal">Data da última interação/campanha</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="date-from">Data início (opcional)</Label>
            <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="date-to">Data fim (opcional)</Label>
            <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => call("csv")} disabled={loading !== null || !effectiveOrganizationId}>
            {loading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => call("count")}
            disabled={loading !== null || !effectiveOrganizationId}
          >
            {loading === "count" && <Loader2 className="h-4 w-4 animate-spin" />}
            Só contar
          </Button>
        </div>
        {totals && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Total de leads (após filtro de período): {String(totals.total_leads)}</p>
            <p>Responderam algum botão: {String(totals.total_respondentes)}</p>
            <p>Exportados: {String(totals.total_exportados)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
