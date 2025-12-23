import { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  X, 
  MessageSquare,
  Lightbulb,
  Target,
  Zap,
  Copy,
  Check,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown
} from "lucide-react";
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
  { icon: Target, label: "Fechar venda", prompt: "Me dê um script para fechar essa venda agora" },
  { icon: Lightbulb, label: "Objeção preço", prompt: "Como responder 'está muito caro'?" },
  { icon: Zap, label: "Criar urgência", prompt: "Como criar senso de urgência para fechar?" },
  { icon: MessageSquare, label: "Follow-up", prompt: "Sugira uma mensagem de follow-up persuasiva" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? (
        <Check className="h-3 w-3 text-primary" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

export function SalesAssistant({ 
  isOpen, 
  onClose, 
  customerName,
  conversationContext 
}: SalesAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const analyzeConversation = async () => {
    if (!conversationContext) {
      toast.error("Nenhuma conversa selecionada para analisar");
      return;
    }

    setIsAnalyzing(true);
    const analysisPrompt = `Analise esta conversa com o cliente e me dê:
1. Resumo do que o cliente quer
2. Principais objeções identificadas
3. Sugestão de próxima ação
4. Script sugerido para a próxima mensagem

Conversa:
${conversationContext}`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        setIsAnalyzing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('sales-assistant', {
        body: { 
          messages: [{ role: "user", content: analysisPrompt }]
        }
      });

      if (error) {
        console.error("Error:", error);
        toast.error("Erro ao analisar conversa");
        setIsAnalyzing(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setIsAnalyzing(false);
        return;
      }

      setMessages([
        { role: "user", content: "📊 Analisar conversa atual" },
        { role: "assistant", content: data.message }
      ]);
    } catch (err) {
      console.error("Error:", err);
      toast.error("Erro ao analisar conversa");
    }

    setIsAnalyzing(false);
  };

  const handleSend = async (prompt?: string) => {
    const messageText = prompt || input.trim();
    if (!messageText) return;

    const userMessage: Message = { role: "user", content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        setIsLoading(false);
        return;
      }

      // Build context
      let contextualPrompt = messageText;
      if (customerName || conversationContext) {
        contextualPrompt = `${customerName ? `Cliente: ${customerName}\n` : ""}${conversationContext ? `Contexto da conversa:\n${conversationContext}\n\n` : ""}Pergunta: ${messageText}`;
      }

      const { data, error } = await supabase.functions.invoke('sales-assistant', {
        body: { 
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: contextualPrompt }
          ]
        }
      });

      if (error) {
        console.error("Error:", error);
        toast.error("Erro ao processar solicitação");
        setIsLoading(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
    } catch (err) {
      console.error("Error:", err);
      toast.error("Erro ao processar solicitação");
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "fixed right-4 bottom-4 z-50 w-96 bg-card border border-border rounded-xl shadow-2xl flex flex-col transition-all duration-300",
        isMinimized ? "h-14" : "h-[32rem]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-primary/5 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Assistente IA</h3>
            {customerName && !isMinimized && (
              <p className="text-xs text-muted-foreground">Atendendo: {customerName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && !isMinimized && (
            <Button variant="ghost" size="icon" onClick={clearChat} className="h-7 w-7">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsMinimized(!isMinimized)}
            className="h-7 w-7"
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick Actions */}
          {messages.length === 0 && (
            <div className="p-3 border-b border-border space-y-2">
              {conversationContext && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={analyzeConversation}
                  disabled={isAnalyzing}
                  className="w-full gap-2 bg-primary/5 border-primary/20 hover:bg-primary/10"
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Target className="w-4 h-4" />
                  )}
                  Analisar conversa atual
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {quickPrompts.map((qp, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(qp.prompt)}
                    disabled={isLoading}
                    className="gap-1.5 text-xs h-8 justify-start"
                  >
                    <qp.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{qp.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "group relative",
                    msg.role === "user" ? "flex justify-end" : ""
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.role === "assistant" && (
                      <div className="absolute -right-1 top-1">
                        <CopyButton text={msg.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Pensando...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pergunte algo..."
                className="min-h-[40px] max-h-[100px] resize-none text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
