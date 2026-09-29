import { memo, useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ConnectionStatus = "connected" | "pending" | "disconnected" | "checking";

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return raw;
}

/** Mesmo critério do agrupamento por conta (waba_id); sem nome disponível, "BM" + waba abreviado. */
export function bmLabel(wabaId: string | null | undefined, bmName?: string | null): string {
  if (bmName) return bmName;
  if (!wabaId) return "Sem BM vinculada";
  return `BM …${wabaId.slice(-6)}`;
}

const statusDot: Record<ConnectionStatus, string> = {
  connected: "bg-success",
  pending: "bg-warning",
  disconnected: "bg-destructive",
  checking: "bg-muted-foreground animate-pulse",
};
const statusLabel: Record<ConnectionStatus, string> = {
  connected: "Conectado",
  pending: "Pendente",
  disconnected: "Desconectado",
  checking: "Verificando status",
};

interface Props {
  id: string;
  name: string;
  phone: string | null;
  wabaId: string | null;
  bmName?: string | null;
  organizationName?: string | null;
  active: boolean;
  status: ConnectionStatus;
  onManage: (id: string) => void;
  onToggle: (id: string) => void;
}

// React 18 não tipa `inert`; atributo vazio desativa foco/clique na face oculta.
const inertAttr = (on: boolean) => (on ? ({ inert: "" } as Record<string, string>) : {});

const canHover = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export const ConnectionFlipCard = memo(function ConnectionFlipCard({
  id, name, phone, wabaId, bmName, organizationName, active, status, onManage, onToggle,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const flipped = hovered || focused || tapped;
  const bm = bmLabel(wabaId, bmName);
  const phoneText = formatPhone(phone) || phone || "—";

  useEffect(() => {
    if (!tapped) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTapped(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [tapped]);

  return (
    <div
      ref={ref}
      data-testid="connection-card"
      data-flipped={flipped ? "true" : "false"}
      className="relative h-44 [perspective:900px]"
      onPointerEnter={(e) => { if (e.pointerType === "mouse" || canHover()) setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
      onClick={(e) => {
        if (canHover()) return;
        if ((e.target as HTMLElement).closest("[data-card-action]")) return;
        setTapped((v) => !v);
      }}
    >
      <div
        className={cn(
          "relative h-full w-full [transform-style:preserve-3d] motion-safe:transition-transform motion-safe:duration-300",
          flipped && "motion-safe:[transform:rotateY(180deg)]"
        )}
      >
        {/* Frente */}
        <div
          aria-hidden={flipped}
          {...inertAttr(flipped)}
          tabIndex={flipped ? -1 : 0}
          aria-label={`${name}, ${phoneText}, ${statusLabel[status]}`}
          className={cn(
            "absolute inset-0 flex flex-col justify-between rounded-xl border border-border bg-card p-5 text-card-foreground [backface-visibility:hidden] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "motion-reduce:transition-opacity motion-reduce:duration-200",
            flipped ? "motion-reduce:opacity-0 motion-reduce:pointer-events-none" : "motion-reduce:opacity-100"
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span data-testid="status-dot" aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", statusDot[status])} />
            <span>{statusLabel[status]}</span>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <p className="truncate text-base font-semibold">{name}</p>
              </TooltipTrigger>
              <TooltipContent>{name}</TooltipContent>
            </Tooltip>
            <p className="text-sm text-muted-foreground">WhatsApp Cloud (Oficial)</p>
            <p className="truncate text-sm text-card-foreground tabular-nums">{phoneText}</p>
          </div>
          <div className="h-2" aria-hidden="true" />
        </div>

        {/* Verso */}
        <div
          data-testid="connection-card-back"
          aria-hidden={!flipped}
          {...inertAttr(!flipped)}
          className={cn(
            "absolute inset-0 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-card px-3.5 text-card-foreground [backface-visibility:hidden] [transform:rotateY(180deg)]",
            "motion-reduce:[transform:none] motion-reduce:transition-opacity motion-reduce:duration-200",
            flipped ? "motion-reduce:opacity-100" : "motion-reduce:opacity-0 motion-reduce:pointer-events-none"
          )}
        >
          <div className="min-w-0">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Conta empresarial</p>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <p className="truncate text-sm font-medium">{bm}</p>
              </TooltipTrigger>
              <TooltipContent>{wabaId ? `${bm} · WABA ${wabaId}` : bm}</TooltipContent>
            </Tooltip>
            {organizationName && <p className="truncate text-xs text-primary/80">{organizationName}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5" data-card-action>
            <Switch
              checked={active}
              onCheckedChange={() => onToggle(id)}
              aria-label={active ? `Desativar conexão ${name}` : `Ativar conexão ${name}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Gerenciar conexão ${name}`}
              onClick={() => onManage(id)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
