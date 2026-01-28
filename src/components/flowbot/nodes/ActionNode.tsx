import { Zap, Users, ArrowRightLeft, Webhook, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionNodeData, ActionType } from "../types";
import { NodeHandle } from "../NodeHandle";

interface ActionNodeProps {
  data: ActionNodeData;
  selected?: boolean;
  isConnecting?: boolean;
  onEndConnect?: () => void;
}

const actionIcons: Record<ActionType, React.ReactNode> = {
  transfer: <Users className="w-4 h-4" />,
  move_pipeline: <ArrowRightLeft className="w-4 h-4" />,
  webhook: <Webhook className="w-4 h-4" />,
  end: <StopCircle className="w-4 h-4" />,
};

const actionLabels: Record<ActionType, string> = {
  transfer: "Transferir para Atendente",
  move_pipeline: "Mover no Pipeline",
  webhook: "Enviar Webhook",
  end: "Encerrar Fluxo",
};

const actionColors: Record<ActionType, string> = {
  transfer: "bg-orange-500/10 text-orange-500",
  move_pipeline: "bg-cyan-500/10 text-cyan-500",
  webhook: "bg-yellow-500/10 text-yellow-500",
  end: "bg-red-500/10 text-red-500",
};

export function ActionNode({ data, selected, isConnecting, onEndConnect }: ActionNodeProps) {
  const actionType = data.action_type || "end";
  
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
      
      <div className={cn(
        "flex items-center gap-2 p-3 border-b border-border",
        actionColors[actionType]
      )}>
        {actionIcons[actionType]}
        <span className="text-sm font-medium truncate">
          {data.label || actionLabels[actionType]}
        </span>
      </div>
      <div className="p-3">
        <p className="text-sm text-muted-foreground">
          {actionType === "transfer" && (data.transfer_message || "Transferindo...")}
          {actionType === "move_pipeline" && "Move o lead no pipeline"}
          {actionType === "webhook" && (data.webhook_url ? `POST ${data.webhook_url}` : "Configure URL...")}
          {actionType === "end" && "Encerra a conversa"}
        </p>
      </div>
      
      {/* Action nodes are terminal - no output handle (except webhook which can continue) */}
      {actionType === "webhook" && (
        <NodeHandle 
          type="source" 
          position="bottom"
          isConnecting={isConnecting}
        />
      )}
    </div>
  );
}
