import { useState, useEffect, useCallback, useRef } from "react";
import { 
  MessageSquare, 
  Search, 
  Send, 
  Paperclip, 
  CheckCheck,
  Sparkles,
  Archive,
  Clock,
  Play,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SalesAssistant } from "@/components/atendimento/SalesAssistant";
import { toast } from "sonner";

interface Conversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  status: "pending" | "in_progress" | "resolved" | "archived";
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
    lastMessage: "Olá, gostaria de saber mais...",
    time: "2 min",
    status: "pending",
    unread: 3,
    messages: [
      { id: "1", content: "Olá, bom dia!", time: "09:00", isFromCustomer: true },
      { id: "2", content: "Bom dia! Como posso ajudar?", time: "09:01", isFromCustomer: false, status: "read" },
      { id: "3", content: "Gostaria de saber mais sobre o produto", time: "09:02", isFromCustomer: true },
    ]
  },
  {
    id: "2",
    name: "João Santos",
    phone: "+55 21 98888-5678",
    lastMessage: "Perfeito, vou aguardar!",
    time: "15 min",
    status: "in_progress",
    messages: [
      { id: "1", content: "Oi, preciso de ajuda", time: "08:30", isFromCustomer: true },
      { id: "2", content: "Perfeito, vou aguardar!", time: "08:45", isFromCustomer: true },
    ]
  },
  {
    id: "3",
    name: "Ana Costa",
    phone: "+55 31 97777-9012",
    lastMessage: "Muito obrigada!",
    time: "1h",
    status: "resolved",
    messages: [
      { id: "1", content: "Muito obrigada!", time: "08:00", isFromCustomer: true },
    ]
  },
  {
    id: "4",
    name: "Pedro Oliveira",
    phone: "+55 41 96666-3456",
    lastMessage: "Ok, entendi.",
    time: "2h",
    status: "archived",
    messages: [
      { id: "1", content: "Preciso cancelar meu pedido", time: "07:00", isFromCustomer: true },
      { id: "2", content: "Pedido cancelado com sucesso.", time: "07:15", isFromCustomer: false, status: "read" },
      { id: "3", content: "Ok, entendi.", time: "07:16", isFromCustomer: true },
    ]
  },
  {
    id: "5",
    name: "Carla Mendes",
    phone: "+55 51 95555-7890",
    lastMessage: "Não tenho mais interesse.",
    time: "1 dia",
    status: "archived",
    messages: [
      { id: "1", content: "Não tenho mais interesse.", time: "Ontem", isFromCustomer: true },
    ]
  },
];

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30" },
  in_progress: { label: "Em atendimento", className: "bg-primary/10 text-primary border-primary/30" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" },
  archived: { label: "Arquivado", className: "bg-destructive/10 text-destructive border-destructive/30" }
};

type FilterStatus = "all" | "pending" | "in_progress";

// Audio notification using Web Audio API
const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      oscillator.frequency.setValueAtTime(1047, ctx.currentTime + 0.1); // C6 note
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.log("Could not play notification sound:", error);
    }
  }, []);
  
  return playNotificationSound;
};

const Atendimento = () => {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    mockConversations.find(c => c.status !== "archived") || null
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [showSalesAssistant, setShowSalesAssistant] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const playNotificationSound = useNotificationSound();

  // Active conversations (not archived)
  const activeConversations = conversations.filter(conv => conv.status !== "archived");
  
  // Archived conversations
  const archivedConversations = conversations.filter(conv => conv.status === "archived");

  // Filter active conversations by search and status
  const filteredConversations = activeConversations.filter(conv => {
    const matchesSearch = conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.phone.includes(searchTerm);
    const matchesStatus = filterStatus === "all" || conv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Filter archived conversations by search
  const filteredArchived = archivedConversations.filter(conv =>
    conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.phone.includes(searchTerm)
  );

  // Archive a conversation
  const handleArchive = (convId: string) => {
    setConversations(prev => prev.map(conv => 
      conv.id === convId ? { ...conv, status: "archived" as const } : conv
    ));
    if (selectedConversation?.id === convId) {
      const nextConv = activeConversations.find(c => c.id !== convId && c.status !== "archived");
      setSelectedConversation(nextConv || null);
    }
  };

  // Restore a conversation from archive
  const handleRestore = (convId: string) => {
    setConversations(prev => prev.map(conv => 
      conv.id === convId ? { ...conv, status: "pending" as const } : conv
    ));
  };

  // Simulate receiving a new message (for demo purposes)
  // In production, this would be triggered by real-time events
  const handleNewCustomerMessage = useCallback((convId: string, messageContent: string) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id !== convId) return conv;
      
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        content: messageContent,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        isFromCustomer: true
      };
      
      // If archived, move to in_progress
      const newStatus = conv.status === "archived" ? "in_progress" as const : conv.status;
      
      // Play notification sound for pending or in_progress conversations
      if (soundEnabled && (conv.status === "pending" || conv.status === "in_progress" || conv.status === "archived")) {
        playNotificationSound();
        
        // Show toast notification
        const statusLabel = conv.status === "archived" ? "restaurada" : "nova mensagem";
        toast.info(`${conv.name}: ${statusLabel}`, {
          description: messageContent.substring(0, 50) + (messageContent.length > 50 ? "..." : ""),
        });
      }
      
      return {
        ...conv,
        status: newStatus,
        lastMessage: messageContent,
        time: "Agora",
        unread: (conv.unread || 0) + 1,
        messages: [...conv.messages, newMessage]
      };
    }));
  }, [soundEnabled, playNotificationSound]);

  // Demo: Simulate incoming messages every 30 seconds (for presentation)
  useEffect(() => {
    const demoMessages = [
      { convId: "4", message: "Olá, mudei de ideia! Gostaria de retomar o pedido." },
      { convId: "1", message: "Vocês ainda estão aí?" },
      { convId: "2", message: "Obrigado pela atenção!" },
    ];
    
    let messageIndex = 0;
    
    const interval = setInterval(() => {
      if (messageIndex < demoMessages.length) {
        const { convId, message } = demoMessages[messageIndex];
        handleNewCustomerMessage(convId, message);
        messageIndex++;
      }
    }, 30000); // Every 30 seconds for demo
    
    return () => clearInterval(interval);
  }, [handleNewCustomerMessage]);

  // Get counts for filter badges
  const pendingCount = activeConversations.filter(c => c.status === "pending").length;
  const inProgressCount = activeConversations.filter(c => c.status === "in_progress").length;

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-4 animate-fade-in">
        {/* Conversations List */}
        <div className="w-80 bg-card rounded-lg border border-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Conversas</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Desativar notificações sonoras" : "Ativar notificações sonoras"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-primary" />
                ) : (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-10 bg-muted/30 border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {/* Status Filter Buttons */}
            <div className="flex gap-1.5">
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
                className="text-xs px-2.5 h-7"
              >
                Todos
              </Button>
              <Button
                variant={filterStatus === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("pending")}
                className="text-xs px-2 h-7 gap-1"
              >
                <Clock className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">Pendentes</span>
                <span className="sm:hidden">Pend.</span>
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] shrink-0">
                    {pendingCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant={filterStatus === "in_progress" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("in_progress")}
                className="text-xs px-2 h-7 gap-1"
              >
                <Play className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">Andamento</span>
                <span className="sm:hidden">And.</span>
                {inProgressCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] shrink-0">
                    {inProgressCount}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhuma conversa encontrada
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group relative",
                      selectedConversation?.id === conv.id && "bg-muted/30 border-l-2 border-l-primary"
                    )}
                  >
                    <button
                      onClick={() => setSelectedConversation(conv)}
                      className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {conv.name.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground text-sm truncate">
                              {conv.name}
                            </span>
                            <span className="text-xs text-muted-foreground">{conv.time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-2">
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
                    {/* Archive button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(conv.id);
                      }}
                      title="Arquivar conversa"
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Archived Section */}
          {archivedConversations.length > 0 && (
            <div className="border-t border-border">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="w-full p-3 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  <span>Arquivados</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {archivedConversations.length}
                  </Badge>
                </div>
                {showArchived ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              
              {showArchived && (
                <ScrollArea className="max-h-48">
                  <div className="divide-y divide-border bg-muted/20">
                    {filteredArchived.map((conv) => (
                      <div
                        key={conv.id}
                        className="group relative p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                              {conv.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-muted-foreground text-sm truncate block">
                              {conv.name}
                            </span>
                            <span className="text-xs text-muted-foreground/70">{conv.time}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRestore(conv.id)}
                            title="Restaurar conversa"
                          >
                            <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-primary" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-card rounded-lg border border-border flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {selectedConversation.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-foreground">{selectedConversation.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedConversation.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showSalesAssistant ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSalesAssistant(!showSalesAssistant)}
                    className="gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    IA de Vendas
                  </Button>
                  <Badge variant="outline" className={cn(statusConfig[selectedConversation.status].className)}>
                    {statusConfig[selectedConversation.status].label}
                  </Badge>
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
                          "max-w-[70%] rounded-lg px-4 py-2",
                          msg.isFromCustomer 
                            ? "bg-muted text-foreground" 
                            : "gradient-primary text-primary-foreground"
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
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                  </Button>
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    className="min-h-[44px] max-h-32 resize-none bg-muted/30 border-border"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={1}
                  />
                  <Button size="icon" className="shrink-0">
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Selecione uma conversa</p>
              </div>
            </div>
          )}
        </div>

        {/* Sales Assistant Panel */}
        <SalesAssistant
          isOpen={showSalesAssistant}
          onClose={() => setShowSalesAssistant(false)}
          customerName={selectedConversation?.name}
          conversationContext={selectedConversation?.messages.map(m => 
            `${m.isFromCustomer ? 'Cliente' : 'Atendente'}: ${m.content}`
          ).join('\n')}
        />
      </div>
    </MainLayout>
  );
};

export default Atendimento;
