import { Bot, MoreVertical, Pencil, Trash2, Power, PowerOff } from "lucide-react";
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

interface ChatbotListItemProps {
  id: string;
  name: string;
  nickname: string;
  agentProfile: string;
  isActive: boolean;
  channelCount: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

const profileLabels: Record<string, string> = {
  vendedor: "Vendedor",
  sdr: "SDR",
  suporte: "Suporte",
  onboarding: "Onboarding",
  recepcionista: "Recepcionista",
  outro: "Outro",
};

export function ChatbotListItem({
  id,
  name,
  nickname,
  agentProfile,
  isActive,
  channelCount,
  onEdit,
  onDelete,
  onToggleActive,
}: ChatbotListItemProps) {
  return (
    <Card 
      className="hover:border-primary/50 transition-all cursor-pointer group"
      onClick={() => onEdit(id)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{name}</h3>
              <Badge variant={isActive ? "default" : "secondary"} className="shrink-0">
                {isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>@{nickname}</span>
              <span>•</span>
              <span>{profileLabels[agentProfile] || agentProfile}</span>
              {channelCount > 0 && (
                <>
                  <span>•</span>
                  <span>{channelCount} {channelCount === 1 ? "canal" : "canais"}</span>
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
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(id); }}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(id, !isActive); }}>
                {isActive ? (
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
                onClick={(e) => { e.stopPropagation(); onDelete(id); }}
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
