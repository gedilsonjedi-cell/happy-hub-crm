import { useState, useEffect } from "react";
import { 
  Bot, 
  MessageCircle, 
  Settings, 
  BookOpen, 
  Save,
  Building2,
  Package,
  HelpCircle,
  Loader2
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AgentConfig {
  id?: string;
  name: string;
  nickname: string;
  sign_conversations: boolean;
  communication_style: string;
  agent_profile: string;
  objective: string;
  company_info: string;
  products_services: string;
  faq: string;
}

const communicationStyles = [
  { value: "consultivo", label: "Consultivo e Acolhedor", example: "Oi! Que bom falar com você. Me conta um pouco sobre o que você está buscando, vou te guiar da melhor forma possível para encontrar a solução ideal." },
  { value: "neutro", label: "Neutro e Equilibrado", example: "Olá! Estou à disposição para ajudá-lo. Como posso auxiliar?" },
  { value: "formal", label: "Formal e Institucional", example: "Prezado(a), seja bem-vindo(a). Em que posso ser útil?" },
];

const agentProfiles = [
  { value: "vendedor", label: "Vendedor" },
  { value: "sdr", label: "SDR" },
  { value: "suporte", label: "Suporte" },
  { value: "onboarding", label: "Onboarding" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "outro", label: "Outro" },
];

const objectiveSuggestions = ["Captar Leads", "Suporte Técnico", "Realizar Follow-ups", "Qualificar Leads", "Agendar Reuniões"];

const Chatbot = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("perfil");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<AgentConfig>({
    name: "",
    nickname: "",
    sign_conversations: true,
    communication_style: "consultivo",
    agent_profile: "vendedor",
    objective: "",
    company_info: "",
    products_services: "",
    faq: "",
  });

  useEffect(() => {
    if (user) {
      loadAgentConfig();
    }
  }, [user]);

  const loadAgentConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          name: data.name || "",
          nickname: data.nickname || "",
          sign_conversations: data.sign_conversations ?? true,
          communication_style: data.communication_style || "consultivo",
          agent_profile: data.agent_profile || "vendedor",
          objective: data.objective || "",
          company_info: data.company_info || "",
          products_services: data.products_services || "",
          faq: data.faq || "",
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!config.name.trim()) {
      toast.error("Nome do agente é obrigatório");
      return;
    }

    setIsSaving(true);
    try {
      const agentData = {
        user_id: user.id,
        name: config.name,
        nickname: config.nickname,
        sign_conversations: config.sign_conversations,
        communication_style: config.communication_style,
        agent_profile: config.agent_profile,
        objective: config.objective,
        company_info: config.company_info,
        products_services: config.products_services,
        faq: config.faq,
        is_active: true,
      };

      if (config.id) {
        const { error } = await supabase
          .from('ai_agents')
          .update(agentData)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('ai_agents')
          .insert(agentData)
          .select()
          .single();
        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (key: keyof AgentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const addObjectiveSuggestion = (suggestion: string) => {
    const current = config.objective.trim();
    const newValue = current ? `${current}\n• ${suggestion}` : `• ${suggestion}`;
    updateConfig("objective", newValue);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const currentStyle = communicationStyles.find(s => s.value === config.communication_style);

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-6 animate-fade-in">
        {/* Sidebar */}
        <div className="w-72 space-y-2">
          <Card 
            className={cn(
              "cursor-pointer transition-all",
              activeTab === "perfil" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}
            onClick={() => setActiveTab("perfil")}
          >
            <CardHeader className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">Perfil</CardTitle>
                  <CardDescription className="text-xs">Identidade e estilo do agente</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <p className="text-xs text-muted-foreground px-2 pt-4">Configurações avançadas (Opcional)</p>

          <Card 
            className={cn(
              "cursor-pointer transition-all",
              activeTab === "comportamento" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}
            onClick={() => setActiveTab("comportamento")}
          >
            <CardHeader className="p-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Comportamento</CardTitle>
                  <CardDescription className="text-xs">Como o agente deve agir</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all",
              activeTab === "conhecimento" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}
            onClick={() => setActiveTab("conhecimento")}
          >
            <CardHeader className="p-4">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Conhecimento</CardTitle>
                  <CardDescription className="text-xs">Informações do seu negócio</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card 
            className={cn(
              "cursor-pointer transition-all",
              activeTab === "configuracoes" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}
            onClick={() => setActiveTab("configuracoes")}
          >
            <CardHeader className="p-4">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm">Configurações</CardTitle>
                  <CardDescription className="text-xs">Preferências avançadas</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              {activeTab === "perfil" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold">Perfil</h2>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome do agente *</Label>
                      <div className="relative">
                        <Input
                          id="name"
                          placeholder="Ex: Assistente Virtual"
                          value={config.name}
                          onChange={(e) => updateConfig("name", e.target.value.slice(0, 50))}
                          maxLength={50}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {config.name.length}/50
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nickname">Apelido *</Label>
                        <div className="relative">
                          <Input
                            id="nickname"
                            placeholder="Ex: Lia"
                            value={config.nickname}
                            onChange={(e) => updateConfig("nickname", e.target.value.slice(0, 20))}
                            maxLength={20}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {config.nickname.length}/20
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Assinar a conversa</Label>
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant={config.sign_conversations ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig("sign_conversations", true)}
                          >
                            Sim
                          </Button>
                          <Button
                            variant={!config.sign_conversations ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig("sign_conversations", false)}
                          >
                            Não
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Forma de comunicação *</Label>
                      <div className="flex flex-wrap gap-2">
                        {communicationStyles.map((style) => (
                          <Button
                            key={style.value}
                            variant={config.communication_style === style.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig("communication_style", style.value)}
                          >
                            {style.label}
                          </Button>
                        ))}
                      </div>
                      {currentStyle && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Exemplo: {currentStyle.example}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Perfil do agente *</Label>
                      <div className="flex flex-wrap gap-2">
                        {agentProfiles.map((profile) => (
                          <Button
                            key={profile.value}
                            variant={config.agent_profile === profile.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig("agent_profile", profile.value)}
                          >
                            {profile.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="objective">Descreva o objetivo deste agente *</Label>
                      <Textarea
                        id="objective"
                        placeholder="Descreva aqui..."
                        value={config.objective}
                        onChange={(e) => updateConfig("objective", e.target.value)}
                        rows={4}
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Sugestões:</span>
                        {objectiveSuggestions.map((suggestion) => (
                          <Badge
                            key={suggestion}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/10"
                            onClick={() => addObjectiveSuggestion(suggestion)}
                          >
                            {suggestion}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "conhecimento" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold">Conhecimento</h2>
                  <p className="text-sm text-muted-foreground">
                    Forneça detalhes sobre a empresa para que a IA possa representá-la com precisão.
                  </p>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-base">Informações sobre a Empresa</CardTitle>
                          <CardDescription className="text-xs">Nome, segmento, história, valores</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Descreva sua empresa, história, missão e valores..."
                        value={config.company_info}
                        onChange={(e) => updateConfig("company_info", e.target.value)}
                        rows={4}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-base">Produtos e Serviços</CardTitle>
                          <CardDescription className="text-xs">O que você oferece aos clientes</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Liste seus principais produtos/serviços, preços, diferenciais..."
                        value={config.products_services}
                        onChange={(e) => updateConfig("products_services", e.target.value)}
                        rows={4}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <HelpCircle className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-base">Perguntas Frequentes (FAQ)</CardTitle>
                          <CardDescription className="text-xs">Dúvidas comuns dos clientes</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Liste perguntas e respostas frequentes..."
                        value={config.faq}
                        onChange={(e) => updateConfig("faq", e.target.value)}
                        rows={4}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === "comportamento" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold">Comportamento</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure como o agente deve agir durante as conversas.
                  </p>

                  <Card className="p-6">
                    <div className="text-center text-muted-foreground">
                      <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Configurações de comportamento em breve</p>
                      <p className="text-xs mt-1">Tempo de resposta, escalação, horários de atendimento</p>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "configuracoes" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold">Configurações</h2>
                  <p className="text-sm text-muted-foreground">
                    Preferências avançadas que controlam o funcionamento da IA.
                  </p>

                  <Card className="p-6">
                    <div className="text-center text-muted-foreground">
                      <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Configurações avançadas em breve</p>
                      <p className="text-xs mt-1">Integrações, webhooks, limites</p>
                    </div>
                  </Card>
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end mt-8 pt-6 border-t border-border">
                <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar Configurações
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </MainLayout>
  );
};

export default Chatbot;
