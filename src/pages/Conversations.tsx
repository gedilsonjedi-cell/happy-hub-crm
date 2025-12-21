import { useState } from "react";
import { 
  MessageSquare, 
  Search, 
  Phone, 
  Send, 
  Paperclip, 
  Smile,
  MoreVertical,
  Clock,
  CheckCheck
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  status: "pending" | "in_progress" | "resolved";
  unread?: number;
  messages: Message[];
}

interface Message {
  id: string;
  content: string;
  time: string;
  isFromCustomer: boolean;
  status?: "sent" | "delivered" | "read";
}

const mockConversations: Conversation[] = [
  {
    id: "1",
    name: "Maria Silva",
    phone: "+55 11 99999-1234",
    lastMessage: "Olá, gostaria de saber mais sobre o produto...",
    time: "2 min",
    status: "pending",
    unread: 3,
    messages: [
      { id: "1", content: "Olá, bom dia!", time: "09:00", isFromCustomer: true },
      { id: "2", content: "Bom dia! Como posso ajudar?", time: "09:01", isFromCustomer: false, status: "read" },
      { id: "3", content: "Gostaria de saber mais sobre o produto X", time: "09:02", isFromCustomer: true },
      { id: "4", content: "Claro! O produto X é excelente para...", time: "09:03", isFromCustomer: false, status: "read" },
      { id: "5", content: "Olá, gostaria de saber mais sobre o produto...", time: "09:15", isFromCustomer: true },
    ]
  },
  {
    id: "2",
    name: "João Santos",
    phone: "+55 21 98888-5678",
    lastMessage: "Perfeito, vou aguardar o retorno!",
    time: "15 min",
    status: "in_progress",
    messages: [
      { id: "1", content: "Oi, preciso de ajuda", time: "08:30", isFromCustomer: true },
      { id: "2", content: "Perfeito, vou aguardar o retorno!", time: "08:45", isFromCustomer: true },
    ]
  },
  {
    id: "3",
    name: "Ana Costa",
    phone: "+55 31 97777-9012",
    lastMessage: "Muito obrigada pela ajuda!",
    time: "1h",
    status: "resolved",
    messages: [
      { id: "1", content: "Muito obrigada pela ajuda!", time: "08:00", isFromCustomer: true },
    ]
  },
];

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/20" },
  in_progress: { label: "Em atendimento", className: "bg-primary/10 text-primary border-primary/20" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" }
};

const Conversations = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(mockConversations[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");

  const filteredConversations = mockConversations.filter(conv => 
    conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.phone.includes(searchTerm)
  );

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-6 animate-fade-in">
        {/* Conversations List */}
        <div className="w-96 bg-card rounded-xl shadow-card border border-border/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-semibold text-card-foreground">Conversas</h2>
              <Badge className="ml-auto gradient-whatsapp text-primary-foreground">
                {mockConversations.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                    selectedConversation?.id === conv.id && "bg-muted/50 border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-12 h-12 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {conv.name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-card-foreground truncate">
                          {conv.name}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {conv.time}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-2">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={cn("text-xs", statusConfig[conv.status].className)}>
                          {statusConfig[conv.status].label}
                        </Badge>
                        {conv.unread && conv.unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-card rounded-xl shadow-card border border-border/50 flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {selectedConversation.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-card-foreground">
                      {selectedConversation.name}
                    </h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Phone className="w-3 h-3" />
                      {selectedConversation.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(statusConfig[selectedConversation.status].className)}>
                    {statusConfig[selectedConversation.status].label}
                  </Badge>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.isFromCustomer ? "justify-start" : "justify-end"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-3",
                          msg.isFromCustomer 
                            ? "bg-muted text-foreground rounded-bl-md" 
                            : "gradient-whatsapp text-primary-foreground rounded-br-md"
                        )}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          msg.isFromCustomer ? "text-muted-foreground" : "text-primary-foreground/70"
                        )}>
                          <span className="text-xs">{msg.time}</span>
                          {!msg.isFromCustomer && msg.status === "read" && (
                            <CheckCheck className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-border">
                <div className="flex items-end gap-3">
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Smile className="w-5 h-5 text-muted-foreground" />
                  </Button>
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    className="min-h-[44px] max-h-32 resize-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={1}
                  />
                  <Button variant="whatsapp" size="icon" className="shrink-0">
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Selecione uma conversa para começar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Conversations;
