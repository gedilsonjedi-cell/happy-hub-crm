import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { ButtonsNodeData } from "../types";
import { Badge } from "@/components/ui/badge";

interface ButtonsNodeProps {
  data: ButtonsNodeData;
  selected?: boolean;
}

export function ButtonsNode({ data, selected }: ButtonsNodeProps) {
  return (
    <div 
      className={cn(
        "w-64 bg-card border border-border rounded-lg shadow-md transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-center gap-2 p-3 border-b border-border bg-purple-500/10">
        <LayoutGrid className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-medium truncate">{data.label || "Botões"}</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {data.message || "Mensagem com botões"}
        </p>
        <div className="flex flex-wrap gap-1">
          {(data.buttons || []).slice(0, 3).map((btn, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {btn.label || `Opção ${i + 1}`}
            </Badge>
          ))}
          {(data.buttons || []).length === 0 && (
            <span className="text-xs text-muted-foreground">Adicione botões...</span>
          )}
        </div>
      </div>
    </div>
  );
}
