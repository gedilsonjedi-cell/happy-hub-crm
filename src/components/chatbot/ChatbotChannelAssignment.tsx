import { useState, useEffect } from "react";
import { Bot, Loader2, Check, X, Smartphone, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  phone: string;
  user_id: string;
  organization_id: string | null;
}

interface Agent {
  id: string;
  name: string;
  nickname: string;
}

interface FlowBot {
  id: string;
  name: string;
  description: string | null;
}

type BotType = "ai" | "flow";

interface ChatbotChannelAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}

export function ChatbotChannelAssignment({
  open,
  onOpenChange,
  onAssigned,
}: ChatbotChannelAssignmentProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flowBots, setFlowBots] = useState<FlowBot[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedBot, setSelectedBot] = useState<string>("");
  const [botType, setBotType] = useState<BotType>("ai");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // First fetch channels
      const { data: channelsData, error: channelsError } = await (supabase as any)
        .from("channels_public")
        .select("id, name, phone, user_id, organization_id")
        .eq("connected", true);

      if (channelsError) throw channelsError;
      
      // Get unique organization IDs from channels
      const orgIds = [...new Set(channelsData?.map((c: any) => c.organization_id).filter(Boolean))] as string[];
      
      // Fetch agents and flow bots for those organizations
      const [agentsRes, flowBotsRes] = await Promise.all([
        supabase
          .from("ai_agents")
          .select("id, name, nickname")
          .eq("is_active", true)
          .in("organization_id", orgIds),
        supabase
          .from("flow_bots")
          .select("id, name, description")
          .eq("is_active", true)
          .in("organization_id", orgIds),
      ]);

      if (agentsRes.error) throw agentsRes.error;
      if (flowBotsRes.error) throw flowBotsRes.error;

      setChannels(channelsData || []);
      setAgents(agentsRes.data || []);
      setFlowBots(flowBotsRes.data || []);
      
      console.log("Loaded flow bots for orgs:", orgIds, flowBotsRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedChannels(channels.map(c => c.id));
    } else {
      setSelectedChannels([]);
    }
  };

  const handleToggleChannel = (channelId: string, checked: boolean) => {
    if (checked) {
      setSelectedChannels(prev => [...prev, channelId]);
    } else {
      setSelectedChannels(prev => prev.filter(id => id !== channelId));
    }
  };

  const handleBotTypeChange = (value: string) => {
    setBotType(value as BotType);
    setSelectedBot(""); // Reset selection when changing type
  };

  const handleSave = async () => {
    if (selectedChannels.length === 0 || !selectedBot) {
      toast.error("Selecione pelo menos um canal e um chatbot");
      return;
    }

    setIsSaving(true);
    try {
      // Process each selected channel
      for (const channelId of selectedChannels) {
        const channel = channels.find(c => c.id === channelId);
        if (!channel) continue;

        // Check if config exists for this channel
        const { data: existing } = await supabase
          .from("chatbot_config")
          .select("id")
          .eq("channel_id", channelId)
          .maybeSingle();

        const configData = {
          bot_type: botType,
          agent_id: botType === "ai" ? selectedBot : null,
          flow_bot_id: botType === "flow" ? selectedBot : null,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update existing config
          await supabase
            .from("chatbot_config")
            .update(configData)
            .eq("id", existing.id);
        } else {
          // Create new config
          await supabase.from("chatbot_config").insert({
            channel_id: channelId,
            user_id: channel.user_id,
            organization_id: channel.organization_id,
            ...configData,
          });
        }
      }

      const msg = selectedChannels.length === 1 
        ? "Chatbot vinculado ao canal com sucesso!" 
        : `Chatbot vinculado a ${selectedChannels.length} canais com sucesso!`;
      toast.success(msg);
      onAssigned();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao vincular chatbot:", error);
      toast.error("Erro ao vincular chatbot aos canais");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedChannels([]);
    setSelectedBot("");
    setBotType("ai");
    setIsEnabled(true);
  };

  const allSelected = channels.length > 0 && selectedChannels.length === channels.length;
  const someSelected = selectedChannels.length > 0 && selectedChannels.length < channels.length;

  const currentBotList = botType === "ai" ? agents : flowBots;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Vincular Chatbot a Canais
          </DialogTitle>
          <DialogDescription>
            Escolha qual chatbot será usado para atender as conversas dos canais selecionados.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Canais</Label>
              {channels.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground border rounded-md">
                  Nenhum canal conectado
                </div>
              ) : (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {/* Select All Option */}
                  <div className="flex items-center gap-3 p-3 border-b bg-muted/30">
                    <Checkbox
                      id="select-all"
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      className="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                      {...(someSelected ? { "data-state": "indeterminate" } : {})}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer flex-1">
                      Selecionar todos os canais ({channels.length})
                    </label>
                  </div>
                  
                  {/* Individual Channels */}
                  {channels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/20">
                      <Checkbox
                        id={channel.id}
                        checked={selectedChannels.includes(channel.id)}
                        onCheckedChange={(checked) => handleToggleChannel(channel.id, !!checked)}
                      />
                      <label htmlFor={channel.id} className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                        <Smartphone className="w-4 h-4 text-muted-foreground" />
                        <span>{channel.name}</span>
                        <span className="text-muted-foreground text-xs">
                          ({channel.phone})
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {selectedChannels.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedChannels.length} {selectedChannels.length === 1 ? "canal selecionado" : "canais selecionados"}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Tipo de Bot</Label>
              <Tabs value={botType} onValueChange={handleBotTypeChange} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ai" className="flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    Bot com IA
                  </TabsTrigger>
                  <TabsTrigger value="flow" className="flex items-center gap-2">
                    <Workflow className="w-4 h-4" />
                    Fluxo
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>{botType === "ai" ? "Chatbot IA" : "Fluxo"}</Label>
              <Select value={selectedBot} onValueChange={setSelectedBot}>
                <SelectTrigger>
                  <SelectValue placeholder={botType === "ai" ? "Selecione um chatbot" : "Selecione um fluxo"} />
                </SelectTrigger>
                <SelectContent>
                  {currentBotList.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {botType === "ai" ? "Nenhum chatbot ativo" : "Nenhum fluxo ativo"}
                    </div>
                  ) : botType === "ai" ? (
                    agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4" />
                          <span>{agent.name}</span>
                          {agent.nickname && (
                            <span className="text-muted-foreground text-xs">
                              @{agent.nickname}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    flowBots.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        <div className="flex items-center gap-2">
                          <Workflow className="w-4 h-4" />
                          <span>{flow.name}</span>
                          {flow.description && (
                            <span className="text-muted-foreground text-xs truncate max-w-[150px]">
                              {flow.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label className="text-sm font-medium">Ativar chatbot</Label>
                <p className="text-xs text-muted-foreground">
                  O chatbot responderá automaticamente nos canais selecionados
                </p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || selectedChannels.length === 0 || !selectedBot}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
