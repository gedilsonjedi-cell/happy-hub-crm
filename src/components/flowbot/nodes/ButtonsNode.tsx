import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { ButtonsNodeData } from "../types";
import { Badge } from "@/components/ui/badge";
import { NodeHandle } from "../NodeHandle";

interface ButtonsNodeProps {
  data: ButtonsNodeData;
  selected?: boolean;
  isConnecting?: boolean;
  onStartConnect?: (handleId?: string) => void;
  onEndConnect?: () => void;
}

export function ButtonsNode({ data, selected, isConnecting, onStartConnect, onEndConnect }: ButtonsNodeProps) {
  const buttons = data.buttons || [];
  
  return (
    <div 
      className={cn(
        "relative w-64 bg-card border border-border rounded-lg shadow-md transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {/* Input handle on top */}
      <NodeHandle 
        type="target" 
        position="top" 
        isConnecting={isConnecting}
        onEndConnect={onEndConnect}
      />
      
      <div className="flex items-center gap-2 p-3 border-b border-border bg-purple-500/10">
        <LayoutGrid className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-medium truncate">{data.label || "Botões"}</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {data.message || "Mensagem com botões"}
        </p>
        <div className="flex flex-wrap gap-1">
          {buttons.slice(0, 3).map((btn, i) => (
            <div key={btn.id} className="relative">
              <Badge variant="outline" className="text-xs pr-5">
                {btn.label || `Opção ${i + 1}`}
              </Badge>
              {/* Output handle for each button */}
              <NodeHandle 
                type="source" 
                position="right"
                handleId={btn.id}
                onStartConnect={() => onStartConnect?.(btn.id)}
                isConnecting={isConnecting}
                className="!w-3 !h-3 !right-0 !top-1/2 !-translate-y-1/2 !translate-x-1/2"
              />
            </div>
          ))}
          {buttons.length === 0 && (
            <span className="text-xs text-muted-foreground">Adicione botões...</span>
          )}
        </div>
      </div>
      
      {/* Default output handle on bottom (if no buttons) */}
      {buttons.length === 0 && (
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
