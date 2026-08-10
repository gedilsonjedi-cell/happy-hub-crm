import { MainLayout } from "@/components/layout/MainLayout";
import { LeadsSemInteracaoExport } from "@/components/admin/LeadsSemInteracaoExport";

export default function LeadsSemInteracao() {
  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Leads sem interação</h1>
          <p className="text-muted-foreground">
            Exporte os leads da organização atual que nunca clicaram nos botões das campanhas.
          </p>
        </div>
        <LeadsSemInteracaoExport />
      </div>
    </MainLayout>
  );
}
