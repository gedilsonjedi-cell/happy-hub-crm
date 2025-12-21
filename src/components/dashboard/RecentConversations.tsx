import { MessageSquare, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  status: "pending" | "in_progress" | "resolved";
  unread?: number;
}

const mockConversations: Conversation[] = [
  {
    id: "1",
    name: "Maria Silva",
    phone: "+55 11 99999-1234",
    lastMessage: "Olá, gostaria de saber mais sobre o produto...",
    time: "2 min",
    status: "pending",
    unread: 3
  },
  {
    id: "2",
    name: "João Santos",
    phone: "+55 21 98888-5678",
    lastMessage: "Perfeito, vou aguardar o retorno!",
    time: "15 min",
    status: "in_progress"
  },
  {
    id: "3",
    name: "Ana Costa",
    phone: "+55 31 97777-9012",
    lastMessage: "Muito obrigada pela ajuda!",
    time: "1h",
    status: "resolved"
  },
  {
    id: "4",
    name: "Pedro Lima",
    phone: "+55 41 96666-3456",
    lastMessage: "Quando posso agendar uma reunião?",
    time: "2h",
    status: "pending",
    unread: 1
  }
];

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/20" },
  in_progress: { label: "Em atendimento", className: "bg-primary/10 text-primary border-primary/20" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" }
};

export function RecentConversations() {
  return (
    <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-card-foreground">Conversas Recentes</h3>
        </div>
        <a href="/conversations" className="text-sm text-primary font-medium hover:underline">
          Ver todas
        </a>
      </div>
      
      <div className="divide-y divide-border">
        {mockConversations.map((conversation, index) => (
          <div 
            key={conversation.id}
            className="p-4 hover:bg-muted/50 transition-colors cursor-pointer animate-slide-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-4">
              <Avatar className="w-12 h-12 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {conversation.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-card-foreground truncate">
                    {conversation.name}
                  </h4>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Clock className="w-3 h-3" />
                    {conversation.time}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground truncate mb-2">
                  {conversation.lastMessage}
                </p>
                
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={cn("text-xs", statusConfig[conversation.status].className)}>
                    {statusConfig[conversation.status].label}
                  </Badge>
                  
                  {conversation.unread && conversation.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {conversation.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
