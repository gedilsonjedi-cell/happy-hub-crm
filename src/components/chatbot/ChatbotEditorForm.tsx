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
  Loader2,
  Eye,
  Zap,
  Users,
  Clock,
  AlertTriangle,
  X,
  Plus,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { DocumentUpload } from "@/components/chatbot/DocumentUpload";
import { AgentPreview } from "@/components/chatbot/AgentPreview";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface KnowledgeDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

export interface AgentConfig {
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
  response_delay_min: number;
  response_delay_max: number;
  simulate_typing: boolean;
  auto_escalate_enabled: boolean;
  escalate_keywords: string[];
  escalate_after_messages: number;
  escalate_on_sentiment: boolean;
  use_business_hours: boolean;
  out_of_hours_message: string;
  auto_greet_enabled: boolean;
  greeting_delay_seconds: number;
}

interface ChatbotEditorFormProps {
  agentId?: string;
  onBack: () => void;
  onSaved: () => void;
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

const defaultConfig: AgentConfig = {
  name: "",
  nickname: "",
  sign_conversations: true,
  communication_style: "consultivo",
  agent_profile: "vendedor",
  objective: "",
  company_info: "",
  products_services: "",
  faq: "",
  response_delay_min: 1,
  response_delay_max: 3,
  simulate_typing: true,
  auto_escalate_enabled: false,
  escalate_keywords: [],
  escalate_after_messages: 5,
  escalate_on_sentiment: false,
  use_business_hours: true,
  out_of_hours_message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!",
  auto_greet_enabled: true,
  greeting_delay_seconds: 2,
};

export function ChatbotEditorForm({ agentId, onBack, onSaved }: ChatbotEditorFormProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("perfil");
  const [isLoading, setIsLoading] = useState(!!agentId);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(defaultConfig);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (agentId && user) {
      loadAgentConfig();
      loadDocuments();
    }
  }, [agentId, user]);

  const loadDocuments = async () => {
    if (!agentId) return;
    const { data } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
    setDocuments(data || []);
  };

  const loadAgentConfig = async () => {
    if (!agentId) return;
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('id', agentId)
        .single();

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
          response_delay_min: data.response_delay_min ?? 1,
          response_delay_max: data.response_delay_max ?? 3,
          simulate_typing: data.simulate_typing ?? true,
          auto_escalate_enabled: data.auto_escalate_enabled ?? false,
          escalate_keywords: data.escalate_keywords || [],
          escalate_after_messages: data.escalate_after_messages ?? 5,
          escalate_on_sentiment: data.escalate_on_sentiment ?? false,
          use_business_hours: data.use_business_hours ?? true,
          out_of_hours_message: data.out_of_hours_message || "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!",
          auto_greet_enabled: data.auto_greet_enabled ?? true,
          greeting_delay_seconds: data.greeting_delay_seconds ?? 2,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar chatbot");
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
        response_delay_min: config.response_delay_min,
        response_delay_max: config.response_delay_max,
        simulate_typing: config.simulate_typing,
        auto_escalate_enabled: config.auto_escalate_enabled,
        escalate_keywords: config.escalate_keywords,
        escalate_after_messages: config.escalate_after_messages,
        escalate_on_sentiment: config.escalate_on_sentiment,
        use_business_hours: config.use_business_hours,
        out_of_hours_message: config.out_of_hours_message,
        auto_greet_enabled: config.auto_greet_enabled,
        greeting_delay_seconds: config.greeting_delay_seconds,
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

      toast.success("Chatbot salvo com sucesso!");
      onSaved();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar chatbot");
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
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentStyle = communicationStyles.find(s => s.value === config.communication_style);

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-6 animate-fade-in">
      {/* Sidebar */}
      <div className="w-72 space-y-2">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar para lista
        </Button>

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

                {user && config.id && (
                  <DocumentUpload
                    userId={user.id}
                    agentId={config.id}
                    documents={documents}
                    onDocumentsChange={loadDocuments}
                  />
                )}
              </div>
            )}

            {activeTab === "comportamento" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Comportamento</h2>
                <p className="text-sm text-muted-foreground">
                  Configure como o agente deve agir durante as conversas.
                </p>

                {/* Tempo de Resposta */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Tempo de Resposta</CardTitle>
                        <CardDescription className="text-xs">
                          Defina o tempo que o agente aguarda antes de responder
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Simular digitação</Label>
                        <p className="text-xs text-muted-foreground">
                          Mostra indicador "digitando..." para parecer mais natural
                        </p>
                      </div>
                      <Switch
                        checked={config.simulate_typing}
                        onCheckedChange={(checked) => updateConfig("simulate_typing", checked)}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-medium">Delay de resposta</Label>
                        <span className="text-sm text-muted-foreground">
                          {config.response_delay_min}s - {config.response_delay_max}s
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Mínimo (segundos)</Label>
                          <Slider
                            value={[config.response_delay_min]}
                            onValueChange={(value) => updateConfig("response_delay_min", value[0])}
                            min={0}
                            max={10}
                            step={1}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Máximo (segundos)</Label>
                          <Slider
                            value={[config.response_delay_max]}
                            onValueChange={(value) => updateConfig("response_delay_max", Math.max(value[0], config.response_delay_min))}
                            min={0}
                            max={15}
                            step={1}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <Label className="text-sm font-medium">Saudação automática</Label>
                        <p className="text-xs text-muted-foreground">
                          Envia mensagem de boas-vindas automaticamente
                        </p>
                      </div>
                      <Switch
                        checked={config.auto_greet_enabled}
                        onCheckedChange={(checked) => updateConfig("auto_greet_enabled", checked)}
                      />
                    </div>

                    {config.auto_greet_enabled && (
                      <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs text-muted-foreground">Delay da saudação</Label>
                          <span className="text-xs text-muted-foreground">{config.greeting_delay_seconds}s</span>
                        </div>
                        <Slider
                          value={[config.greeting_delay_seconds]}
                          onValueChange={(value) => updateConfig("greeting_delay_seconds", value[0])}
                          min={0}
                          max={10}
                          step={1}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Escalação para Atendente */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Escalação para Atendente</CardTitle>
                        <CardDescription className="text-xs">
                          Quando transferir para um humano automaticamente
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Escalação automática</Label>
                        <p className="text-xs text-muted-foreground">
                          Transfere para atendente em situações específicas
                        </p>
                      </div>
                      <Switch
                        checked={config.auto_escalate_enabled}
                        onCheckedChange={(checked) => updateConfig("auto_escalate_enabled", checked)}
                      />
                    </div>

                    {config.auto_escalate_enabled && (
                      <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-sm font-medium">Após quantas mensagens</Label>
                            <span className="text-sm text-muted-foreground">{config.escalate_after_messages} mensagens</span>
                          </div>
                          <Slider
                            value={[config.escalate_after_messages]}
                            onValueChange={(value) => updateConfig("escalate_after_messages", value[0])}
                            min={2}
                            max={20}
                            step={1}
                          />
                          <p className="text-xs text-muted-foreground">
                            Escala se não resolver após este número de mensagens
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Detectar sentimento negativo</Label>
                            <p className="text-xs text-muted-foreground">
                              Escala quando detectar frustração ou insatisfação
                            </p>
                          </div>
                          <Switch
                            checked={config.escalate_on_sentiment}
                            onCheckedChange={(checked) => updateConfig("escalate_on_sentiment", checked)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Palavras-chave para escalação</Label>
                          <p className="text-xs text-muted-foreground mb-2">
                            Escala quando o cliente usar estas palavras
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {config.escalate_keywords.map((keyword, index) => (
                              <Badge key={index} variant="secondary" className="gap-1">
                                {keyword}
                                <X
                                  className="w-3 h-3 cursor-pointer hover:text-destructive"
                                  onClick={() => {
                                    const newKeywords = config.escalate_keywords.filter((_, i) => i !== index);
                                    updateConfig("escalate_keywords", newKeywords);
                                  }}
                                />
                              </Badge>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs gap-1"
                              onClick={() => {
                                const keyword = prompt("Digite a palavra-chave:");
                                if (keyword?.trim() && !config.escalate_keywords.includes(keyword.trim().toLowerCase())) {
                                  updateConfig("escalate_keywords", [...config.escalate_keywords, keyword.trim().toLowerCase()]);
                                }
                              }}
                            >
                              <Plus className="w-3 h-3" />
                              Adicionar
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-2">
                            <span className="text-xs text-muted-foreground">Sugestões:</span>
                            {["atendente", "humano", "pessoa", "gerente", "reclamação", "cancelar"].map((suggestion) => (
                              <Badge
                                key={suggestion}
                                variant="outline"
                                className="cursor-pointer text-xs hover:bg-primary/10"
                                onClick={() => {
                                  if (!config.escalate_keywords.includes(suggestion)) {
                                    updateConfig("escalate_keywords", [...config.escalate_keywords, suggestion]);
                                  }
                                }}
                              >
                                {suggestion}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Horários de Atendimento */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Horários de Atendimento</CardTitle>
                        <CardDescription className="text-xs">
                          Configure o comportamento fora do expediente
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Respeitar horário comercial</Label>
                        <p className="text-xs text-muted-foreground">
                          Usa os horários definidos em Personalização → Horários
                        </p>
                      </div>
                      <Switch
                        checked={config.use_business_hours}
                        onCheckedChange={(checked) => updateConfig("use_business_hours", checked)}
                      />
                    </div>

                    {config.use_business_hours && (
                      <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                        <Label className="text-sm font-medium">Mensagem fora do horário</Label>
                        <Textarea
                          placeholder="Mensagem enviada fora do expediente..."
                          value={config.out_of_hours_message}
                          onChange={(e) => updateConfig("out_of_hours_message", e.target.value)}
                          rows={3}
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Configure os horários de funcionamento em{" "}
                        <a href="/personalizacao/horarios" className="text-primary hover:underline">
                          Personalização → Horários
                        </a>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "configuracoes" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Configurações</h2>
                <p className="text-sm text-muted-foreground">
                  Preferências avançadas que controlam o funcionamento da IA.
                </p>

                <div className="grid gap-4">
                  <Card className="p-4 border-dashed">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Integrações Externas</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Conecte com CRMs, ERPs e outros sistemas para buscar informações em tempo real durante as conversas.
                        </p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 border-dashed">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Webhooks</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Receba notificações em tempo real sobre eventos do agente como início de conversa, qualificação e escalação.
                        </p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 border-dashed">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Limites e Uso</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Configure limites de mensagens, tokens de IA e monitore o consumo do seu agente.
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>

                <p className="text-xs text-center text-muted-foreground pt-4">
                  Estas funcionalidades estarão disponíveis em breve
                </p>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
              <Button 
                variant="outline" 
                onClick={() => setShowPreview(!showPreview)} 
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? "Ocultar Preview" : "Testar Agente"}
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Chatbot
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Agent Preview Sheet */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Preview do Agente</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <AgentPreview
              agentName={config.name}
              nickname={config.nickname}
              communicationStyle={config.communication_style}
              agentProfile={config.agent_profile}
              objective={config.objective}
              companyInfo={config.company_info}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
