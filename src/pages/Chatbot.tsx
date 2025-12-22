import { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Bot, 
  User, 
  Loader2,
  RefreshCw,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  detectedStage?: string;
  stageName?: string;
  created_at: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

const STAGE_COLORS: Record<string, string> = {
  "pre-atendimento": "#3b82f6",
  "vendas": "#22c55e",
  "nao-finalizou": "#ef4444",
  "follow-up": "#f59e0b",
  "cliente": "#8b5cf6",
};

const Chatbot = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchStages();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchLeads = async () => {
    const { data } = await supabase
      .from("leads")
      .select("id, name, phone")
      .order("created_at", { ascending: false });
    setLeads(data || []);
  };

  const fetchStages = async () => {
    const { data } = await supabase
      .from("pipeline_stages")
      .select("id, name, color")
      .order("order_index");
    setStages(data || []);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const conversationMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage.content }
      ];

      const { data, error } = await supabase.functions.invoke("chatbot", {
        body: { 
          messages: conversationMessages,
          leadId: selectedLead || null,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        if (data.error.includes("Rate limit")) {
          toast.error("Limite de requisições atingido. Tente novamente em alguns segundos.");
        } else if (data.error.includes("credits")) {
          toast.error("Créditos de IA esgotados. Adicione créditos para continuar.");
        } else {
          throw new Error(data.error);
        }
        return;
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
        detectedStage: data.detectedStage,
        stageName: data.stageName,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.detectedStage) {
        setCurrentStage(data.detectedStage);
        if (selectedLead && data.stageName) {
          toast.success(`Lead movido para: ${data.stageName}`);
        }
      }

    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Erro ao enviar mensagem. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentStage(null);
  };

  const getStageColor = (stage: string | undefined) => {
    if (!stage) return "#6b7280";
    return STAGE_COLORS[stage] || "#6b7280";
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-120px)] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Chatbot IA</h1>
            <p className="text-muted-foreground text-sm">
              Converse com a IA que identifica automaticamente o estágio do lead
            </p>
          </div>
          <div className="flex items-center gap-3">
            {currentStage && (
              <Badge 
                className="gap-1 text-white"
                style={{ backgroundColor: getStageColor(currentStage) }}
              >
                <Sparkles className="w-3 h-3" />
                {currentStage.replace("-", " ")}
              </Badge>
            )}
            <Select value={selectedLead} onValueChange={setSelectedLead}>
              <SelectTrigger className="w-[200px] bg-card border-border">
                <SelectValue placeholder="Vincular a um lead" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border z-50">
                <SelectItem value="none">Sem vínculo</SelectItem>
                {leads.map(lead => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={clearChat}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Assistente de Vendas IA
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Simule uma conversa com um lead. A IA identificará automaticamente 
                    o estágio do pipeline e atualizará o lead vinculado.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-6">
                    {[
                      "Olá, quero saber mais sobre o produto",
                      "Qual o preço?",
                      "Preciso pensar antes de decidir"
                    ].map((suggestion, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setInputValue(suggestion)}
                      >
                        <ArrowRight className="w-3 h-3" />
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg px-4 py-2",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.stageName && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <Badge 
                            variant="outline" 
                            className="text-xs gap-1"
                            style={{ 
                              borderColor: getStageColor(message.detectedStage),
                              color: getStageColor(message.detectedStage)
                            }}
                          >
                            <Sparkles className="w-2 h-2" />
                            {message.stageName}
                          </Badge>
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Input
                placeholder="Digite uma mensagem como lead..."
                className="bg-background border-border"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!inputValue.trim() || isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              A IA identifica automaticamente: Pré-atendimento, Vendas, Não finalizou, Follow-up, Cliente
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Chatbot;
