import { GitBranch, MoreVertical, Pencil, Trash2, Power, PowerOff, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlowBot } from "./types";

interface FlowBotListItemProps {
  bot: FlowBot;
  nodeCount: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

export function FlowBotListItem({
  bot,
  nodeCount,
  onEdit,
  onDelete,
  onToggleActive,
}: FlowBotListItemProps) {
  return (
    <Card 
      className="hover:border-primary/50 transition-all cursor-pointer group"
      onClick={() => onEdit(bot.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <GitBranch className="w-6 h-6 text-orange-500" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{bot.name}</h3>
              <Badge variant={bot.is_active ? "default" : "secondary"} className="shrink-0">
                {bot.is_active ? "Ativo" : "Inativo"}
              </Badge>
              {bot.ai_fallback_enabled && (
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Sparkles className="w-3 h-3" />
                  IA
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{nodeCount} {nodeCount === 1 ? "bloco" : "blocos"}</span>
              {bot.description && (
                <>
                  <span>•</span>
                  <span className="truncate">{bot.description}</span>
                </>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(bot.id); }}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(bot.id, !bot.is_active); }}>
                {bot.is_active ? (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Desativar
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Ativar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDelete(bot.id); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
