import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AgentPreviewProps {
  agentName: string;
  nickname: string;
  communicationStyle: string;
  agentProfile: string;
  objective: string;
  companyInfo: string;
  serviceGuideEnabled?: boolean;
  serviceGuide?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const sampleQuestions = [
  "Olá, quero saber mais sobre vocês",
  "Qual o preço do produto?",
  "Vocês fazem entrega?",
];

export const AgentPreview = ({
  agentName,
  nickname,
  communicationStyle,
  agentProfile,
  objective,
  companyInfo,
  serviceGuideEnabled,
  serviceGuide,
}: AgentPreviewProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('agent-preview', {
        body: {
          message: messageText,
          agentConfig: {
            name: agentName,
            nickname,
            communication_style: communicationStyle,
            agent_profile: agentProfile,
            objective,
            company_info: companyInfo,
            service_guide_enabled: serviceGuideEnabled,
            service_guide: serviceGuide,
          },
          conversationHistory: messages,
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "Sem resposta"
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error("Erro ao obter resposta do preview");
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <Card className="h-full flex flex-col border-0 rounded-none">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Preview do Agente</CardTitle>
              <CardDescription className="text-xs">
                Teste como {nickname || agentName || "o agente"} vai responder
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={clearChat}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8">
                <Bot className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Teste o agente com as configurações atuais
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {sampleQuestions.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleSend(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-4">
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
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Digite uma mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
