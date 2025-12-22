import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, X, Lightbulb, Target, MessageCircle, RefreshCw, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SalesAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  customerName?: string;
  conversationContext?: string;
}

const quickPrompts = [
  { icon: MessageCircle, label: "Analisar conversa", prompt: "__ANALYZE__", isAnalyze: true },
  { icon: Target, label: "Fechar venda", prompt: "Me ajude a fechar essa venda agora." },
  { icon: RefreshCw, label: "Reverter objeção", prompt: "Como posso reverter a objeção do cliente?" },
  { icon: Lightbulb, label: "Nova abordagem", prompt: "Sugira uma nova abordagem de vendas." },
];

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-1 right-1 p-1 rounded hover:bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copiar"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground" />
      )}
    </button>
  );
};

export const SalesAssistant = ({ isOpen, onClose, customerName, conversationContext }: SalesAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const analyzeConversation = async () => {
    if (!conversationContext || isAnalyzing) return;
    
    setIsAnalyzing(true);

    try {
      const analysisPrompt = `Analise esta conversa de atendimento e forneça:
1. Um resumo rápido do que o cliente quer/precisa
2. O estágio atual da negociação (início, interesse, objeção, decisão)
3. 2-3 sugestões práticas de como o atendente deve proceder

Conversa:
${conversationContext}`;

      const { data, error } = await supabase.functions.invoke('sales-assistant', {
        body: { 
          messages: [{ role: "user", content: analysisPrompt }]
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "Não consegui analisar a conversa."
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Erro ao analisar conversa:", error);
      toast.error("Erro ao analisar conversa");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSend = async (customPrompt?: string) => {
    if (customPrompt === "__ANALYZE__") {
      analyzeConversation();
      return;
    }

    const messageText = customPrompt || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const contextMessage = customerName 
        ? `Contexto: Estou atendendo o cliente "${customerName}".${conversationContext ? ` Histórico: ${conversationContext}` : ""}\n\nPergunta: ${messageText}`
        : messageText;

      const { data, error } = await supabase.functions.invoke('sales-assistant', {
        body: { 
          messages: [...messages, { role: "user", content: contextMessage }]
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "Não consegui processar."
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error("Erro ao obter resposta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-card rounded-lg border border-border flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">IA de Vendas</h3>
              <p className="text-xs text-muted-foreground">Suporte inteligente em vendas</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Analyzing State */}
      {isAnalyzing && (
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Analisando conversa...</span>
          </div>
        </div>
      )}

      {/* Quick Prompts - only show if no messages and not analyzing */}
      {messages.length === 0 && !isAnalyzing && (
        <div className="p-3 border-b border-border bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">Sugestões rápidas:</p>
          <div className="grid grid-cols-2 gap-2">
            {quickPrompts.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item.prompt)}
                className="flex items-center gap-1.5 p-2 rounded-md bg-background hover:bg-muted transition-colors text-left"
              >
                <item.icon className="w-3 h-3 text-primary shrink-0" />
                <span className="text-xs text-foreground truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 max-h-72">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-4">
              <Bot className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Pergunte sobre técnicas de vendas, como lidar com objeções ou scripts para fechar negócios.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm group relative",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.role === "assistant" && (
                  <CopyButton text={msg.content} />
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border">
        {messages.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full mb-2 text-xs text-muted-foreground"
            onClick={clearChat}
          >
            Limpar conversa
          </Button>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Pergunte algo..."
            className="min-h-[40px] max-h-20 resize-none text-sm bg-muted/30 border-border"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            rows={1}
          />
          <Button 
            size="icon" 
            className="shrink-0 h-10 w-10"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
