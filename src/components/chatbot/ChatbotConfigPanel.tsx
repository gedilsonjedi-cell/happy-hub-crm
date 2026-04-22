import { useState, useEffect } from "react";
import { 
  Bot, 
  Settings, 
  Save, 
  Power, 
  PowerOff,
  MessageSquare,
  Users,
  ArrowRight,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Channel {
  id: string;
  name: string;
  phone: string;
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

interface ChatbotConfig {
  id?: string;
  channel_id: string;
  is_enabled: boolean;
  auto_reply_when_unavailable: boolean;
  welcome_message: string;
  transfer_message: string;
  away_message: string;
  qualification_keywords: string[];
  auto_qualify_enabled: boolean;
  initial_stage_id: string | null;
  qualified_stage_id: string | null;
}

export const ChatbotConfigPanel = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState("");

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (selectedChannel) {
      fetchConfig();
    }
  }, [selectedChannel]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch channels
    const { data: channelsData } = await (supabase as any)
      .from("channels_public")
      .select("id, name, phone")
      .eq("provider", "gupshup")
      .eq("connected", true);

    if (channelsData) {
      setChannels(channelsData);
      if (channelsData.length > 0) {
        setSelectedChannel(channelsData[0].id);
      }
    }

    // Fetch pipeline stages
    const { data: stagesData } = await supabase
      .from("pipeline_stages")
      .select("id, name, color")
      .order("order_index");

    if (stagesData) {
      setStages(stagesData);
    }

    setLoading(false);
  };

  const fetchConfig = async () => {
    const { data } = await supabase
      .from("chatbot_config")
      .select("*")
      .eq("channel_id", selectedChannel)
      .single();

    if (data) {
      setConfig(data);
      setKeywordsInput((data.qualification_keywords || []).join(", "));
    } else {
      // Create default config
      setConfig({
        channel_id: selectedChannel,
        is_enabled: true,
        auto_reply_when_unavailable: true,
        welcome_message: "Olá! Sou o assistente virtual. Como posso ajudá-lo hoje?",
        transfer_message: "Vou transferir você para um de nossos atendentes. Por favor, aguarde.",
        away_message: "No momento todos os atendentes estão ocupados. Em breve alguém irá atendê-lo.",
        qualification_keywords: ["preço", "valor", "comprar", "interesse", "orçamento"],
        auto_qualify_enabled: true,
        initial_stage_id: stages[0]?.id || null,
        qualified_stage_id: stages[1]?.id || null
      });
      setKeywordsInput("preço, valor, comprar, interesse, orçamento");
    }
  };

  const handleSave = async () => {
    if (!config || !selectedChannel) return;

    setSaving(true);

    const keywords = keywordsInput
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const configData = {
      ...config,
      channel_id: selectedChannel,
      user_id: user?.id,
      qualification_keywords: keywords
    };

    if (config.id) {
      const { error } = await supabase
        .from("chatbot_config")
        .update(configData)
        .eq("id", config.id);

      if (error) {
        toast.error("Erro ao salvar configurações");
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("chatbot_config")
        .insert(configData)
        .select()
        .single();

      if (error) {
        toast.error("Erro ao criar configurações");
        setSaving(false);
        return;
      }

      setConfig({ ...config, id: data.id });
    }

    toast.success("Configurações salvas!");
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium text-foreground mb-2">Nenhum canal configurado</h3>
          <p className="text-sm text-muted-foreground">
            Configure um canal WhatsApp para ativar o chatbot automático
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Channel Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Chatbot Automático
          </CardTitle>
          <CardDescription>
            Configure respostas automáticas e distribuição de atendimentos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="mb-2 block">Canal WhatsApp</Label>
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name} ({channel.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={config?.is_enabled ?? false}
                onCheckedChange={(checked) => setConfig(prev => prev ? { ...prev, is_enabled: checked } : null)}
              />
              <Label>{config?.is_enabled ? "Ativo" : "Inativo"}</Label>
              {config?.is_enabled ? (
                <Power className="w-4 h-4 text-emerald-500" />
              ) : (
                <PowerOff className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {config && (
        <>
          {/* Messages Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Mensagens Automáticas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Mensagem de Boas-vindas</Label>
                <Textarea
                  value={config.welcome_message}
                  onChange={(e) => setConfig({ ...config, welcome_message: e.target.value })}
                  placeholder="Mensagem enviada no primeiro contato..."
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label className="mb-2 block">Mensagem de Transferência</Label>
                <Textarea
                  value={config.transfer_message}
                  onChange={(e) => setConfig({ ...config, transfer_message: e.target.value })}
                  placeholder="Mensagem enviada ao transferir para atendente..."
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label className="mb-2 block">Mensagem de Ausência</Label>
                <Textarea
                  value={config.away_message}
                  onChange={(e) => setConfig({ ...config, away_message: e.target.value })}
                  placeholder="Mensagem quando não há atendentes disponíveis..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={config.auto_reply_when_unavailable}
                  onCheckedChange={(checked) => setConfig({ ...config, auto_reply_when_unavailable: checked })}
                />
                <Label>Responder automaticamente com IA quando sem atendentes</Label>
              </div>
            </CardContent>
          </Card>

          {/* Qualification Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5" />
                Qualificação Automática
              </CardTitle>
              <CardDescription>
                Move automaticamente leads no pipeline baseado nas mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.auto_qualify_enabled}
                  onCheckedChange={(checked) => setConfig({ ...config, auto_qualify_enabled: checked })}
                />
                <Label>Qualificar leads automaticamente</Label>
              </div>

              {config.auto_qualify_enabled && (
                <>
                  <div>
                    <Label className="mb-2 block">Palavras-chave de Qualificação</Label>
                    <Input
                      value={keywordsInput}
                      onChange={(e) => setKeywordsInput(e.target.value)}
                      placeholder="preço, valor, comprar (separadas por vírgula)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Quando o cliente mencionar estas palavras, será movido para o estágio de qualificação
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="mb-2 block">Estágio Inicial</Label>
                      <Select 
                        value={config.initial_stage_id || ""} 
                        onValueChange={(value) => setConfig({ ...config, initial_stage_id: value || null })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map(stage => (
                            <SelectItem key={stage.id} value={stage.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: stage.color }}
                                />
                                {stage.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block">Estágio Qualificado</Label>
                      <Select 
                        value={config.qualified_stage_id || ""} 
                        onValueChange={(value) => setConfig({ ...config, qualified_stage_id: value || null })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map(stage => (
                            <SelectItem key={stage.id} value={stage.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: stage.color }}
                                />
                                {stage.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
