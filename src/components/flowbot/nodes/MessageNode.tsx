import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageNodeData } from "../types";

interface MessageNodeProps {
  data: MessageNodeData;
  selected?: boolean;
}

export function MessageNode({ data, selected }: MessageNodeProps) {
  return (
    <div 
      className={cn(
        "w-64 bg-card border border-border rounded-lg shadow-md transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-center gap-2 p-3 border-b border-border bg-blue-500/10">
        <MessageSquare className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium truncate">{data.label || "Mensagem"}</span>
      </div>
      <div className="p-3">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {data.message || "Clique para editar..."}
        </p>
      </div>
    </div>
  );
}
