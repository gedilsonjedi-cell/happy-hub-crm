import { MainLayout } from "@/components/layout/MainLayout";
import { LeadsSemInteracaoExport } from "@/components/admin/LeadsSemInteracaoExport";

export default function LeadsSemInteracao() {
  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Exportar Leads</h1>
          <p className="text-muted-foreground">
            Exporte leads da organização atual em CSV, com filtro por tipo e período.
          </p>
        </div>
        <LeadsSemInteracaoExport />
      </div>
    </MainLayout>
  );
}
