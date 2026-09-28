import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionFlipCard, type ConnectionStatus } from "@/components/connections/ConnectionFlipCard";
const st: ConnectionStatus[] = ["connected", "connected", "pending", "disconnected"];
const items = Array.from({ length: 18 }, (_, i) => ({
  id: `d${i}`, name: i === 1 ? "Cobrança Regional Sudeste — Número Principal de Atendimento" : `Demo Canal ${String(i + 1).padStart(2, "0")}`,
  phone: `55119${String(80000000 + i * 137).padStart(8, "0")}`, wabaId: `99887766554${String(4000 + (i % 3))}`, status: st[i % 4],
}));
export default function DemoConexoesTmp() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-app p-4">
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {items.map((c) => (
            <ConnectionFlipCard key={c.id} {...c} active={c.status !== "disconnected"} onManage={() => {}} onToggle={() => {}} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
