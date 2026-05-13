import { FileText, AlertCircle, ExternalLink, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateNodeData } from "../types";
import { NodeHandle } from "../NodeHandle";

interface TemplateNodeProps {
  data: TemplateNodeData;
  selected?: boolean;
  isConnecting?: boolean;
  onStartConnect?: (handleId?: string) => void;
  onEndConnect?: () => void;
}

export function TemplateNode({ data, selected, isConnecting, onStartConnect, onEndConnect }: TemplateNodeProps) {
  const hasTemplate = !!data.template_id;
  const buttons = data.buttons || [];
  const isImageHeader = !!data.header_url;

  return (
    <div
      className={cn(
        "relative w-80 bg-card border rounded-lg shadow-md transition-all",
        hasTemplate ? "border-emerald-500/40" : "border-destructive/60",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <NodeHandle
        type="target"
        position="top"
        isConnecting={isConnecting}
        onEndConnect={onEndConnect}
      />

      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-emerald-500/10 rounded-t-lg">
        <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-medium truncate">
          {data.template_name || data.label || "Template"}
        </span>
      </div>

      {!hasTemplate ? (
        <div className="p-3">
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Selecione um template aprovado
          </p>
        </div>
      ) : (
        <div className="bg-muted/30 p-3 space-y-2">
          {/* Image header preview */}
          {isImageHeader && (
            <img
              src={data.header_url}
              alt="Cabeçalho"
              className="w-full h-32 object-cover rounded border border-border"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
            />
          )}

          {/* Body — fiel ao template */}
          {data.body && (
            <div className="bg-background rounded p-2 border border-border">
              <p className="text-xs whitespace-pre-wrap break-words text-foreground">
                {data.body}
              </p>
            </div>
          )}

          {/* Footer */}
          {data.footer && (
            <p className="text-[10px] text-muted-foreground italic">{data.footer}</p>
          )}

          {/* Buttons with connect handles */}
          {buttons.length > 0 && (
            <div className="pt-1 space-y-1.5">
              {buttons.map((btn) => {
                const isQR = btn.type === "QUICK_REPLY";
                return (
                  <div key={btn.id} className="relative">
                    <div
                      className={cn(
                        "flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded border",
                        isQR
                          ? "bg-card border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted border-border text-muted-foreground"
                      )}
                    >
                      {btn.type === "URL" && <ExternalLink className="w-3 h-3" />}
                      {btn.type === "PHONE_NUMBER" && <Phone className="w-3 h-3" />}
                      <span className="truncate">{btn.text}</span>
                    </div>
                    {isQR && (
                      <NodeHandle
                        type="source"
                        position="right"
                        handleId={btn.id}
                        onStartConnect={() => onStartConnect?.(btn.id)}
                        isConnecting={isConnecting}
                        className="!w-3 !h-3 !right-0 !top-1/2 !-translate-y-1/2 !translate-x-1/2"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Default bottom handle (used when there are no QUICK_REPLY buttons) */}
      {buttons.filter((b) => b.type === "QUICK_REPLY").length === 0 && (
        <NodeHandle
          type="source"
          position="bottom"
          onStartConnect={() => onStartConnect?.()}
          isConnecting={isConnecting}
        />
      )}
    </div>
  );
}
