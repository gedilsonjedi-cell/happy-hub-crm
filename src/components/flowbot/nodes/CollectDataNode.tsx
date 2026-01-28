import { FormInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollectDataNodeData } from "../types";
import { Badge } from "@/components/ui/badge";
import { NodeHandle } from "../NodeHandle";

interface CollectDataNodeProps {
  data: CollectDataNodeData;
  selected?: boolean;
  isConnecting?: boolean;
  onStartConnect?: () => void;
  onEndConnect?: () => void;
}

const typeLabels: Record<string, string> = {
  text: "Texto",
  number: "Número",
  email: "E-mail",
  phone: "Telefone",
};

export function CollectDataNode({ data, selected, isConnecting, onStartConnect, onEndConnect }: CollectDataNodeProps) {
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
      
      <div className="flex items-center gap-2 p-3 border-b border-border bg-green-500/10">
        <FormInput className="w-4 h-4 text-green-500" />
        <span className="text-sm font-medium truncate">{data.label || "Coletar Dados"}</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {data.message || "Pergunta ao usuário"}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {data.variable_name || "variavel"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {typeLabels[data.variable_type] || "Texto"}
          </Badge>
        </div>
      </div>
      
      {/* Output handle on bottom */}
      <NodeHandle 
        type="source" 
        position="bottom" 
        onStartConnect={onStartConnect}
        isConnecting={isConnecting}
      />
    </div>
  );
}
