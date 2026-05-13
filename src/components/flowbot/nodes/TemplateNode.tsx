import { FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateNodeData } from "../types";
import { NodeHandle } from "../NodeHandle";

interface TemplateNodeProps {
  data: TemplateNodeData;
  selected?: boolean;
  isConnecting?: boolean;
  onStartConnect?: () => void;
  onEndConnect?: () => void;
}

export function TemplateNode({ data, selected, isConnecting, onStartConnect, onEndConnect }: TemplateNodeProps) {
  const hasTemplate = !!data.template_id;
  return (
    <div 
      className={cn(
        "relative w-64 bg-card border rounded-lg shadow-md transition-all",
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
      
      <div className="flex items-center gap-2 p-3 border-b border-border bg-emerald-500/10">
        <FileText className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-medium truncate">{data.label || "Template"}</span>
      </div>
      <div className="p-3">
        {hasTemplate ? (
          <p className="text-sm text-foreground line-clamp-2">
            <span className="text-muted-foreground">Template: </span>
            {data.template_name || data.template_id}
          </p>
        ) : (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Selecione um template aprovado
          </p>
        )}
      </div>
      
      <NodeHandle 
        type="source" 
        position="bottom" 
        onStartConnect={onStartConnect}
        isConnecting={isConnecting}
      />
    </div>
  );
}
