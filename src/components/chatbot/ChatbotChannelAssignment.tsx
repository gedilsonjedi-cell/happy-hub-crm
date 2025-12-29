import { useState, useEffect } from "react";
import { Bot, Loader2, Check, X, Smartphone } from "lucide-react";
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
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
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
      const [channelsRes, agentsRes] = await Promise.all([
        supabase.from("channels").select("id, name, phone, user_id, organization_id").eq("connected", true),
        supabase.from("ai_agents").select("id, name, nickname").eq("is_active", true),
      ]);

      if (channelsRes.error) throw channelsRes.error;
      if (agentsRes.error) throw agentsRes.error;

      setChannels(channelsRes.data || []);
      setAgents(agentsRes.data || []);
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

  const handleSave = async () => {
    if (selectedChannels.length === 0 || !selectedAgent) {
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

        if (existing) {
          // Update existing config
          await supabase
            .from("chatbot_config")
            .update({
              agent_id: selectedAgent,
              is_enabled: isEnabled,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          // Create new config
          await supabase.from("chatbot_config").insert({
            channel_id: channelId,
            agent_id: selectedAgent,
            user_id: channel.user_id,
            organization_id: channel.organization_id,
            is_enabled: isEnabled,
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
    setSelectedAgent("");
    setIsEnabled(true);
  };

  const allSelected = channels.length > 0 && selectedChannels.length === channels.length;
  const someSelected = selectedChannels.length > 0 && selectedChannels.length < channels.length;

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

            <div className="space-y-2">
              <Label>Chatbot</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um chatbot" />
                </SelectTrigger>
                <SelectContent>
                  {agents.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Nenhum chatbot ativo
                    </div>
                  ) : (
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
          <Button onClick={handleSave} disabled={isSaving || selectedChannels.length === 0 || !selectedAgent}>
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
