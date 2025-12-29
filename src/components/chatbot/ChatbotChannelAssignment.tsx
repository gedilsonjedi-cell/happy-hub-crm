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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  phone: string;
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
  const [selectedChannel, setSelectedChannel] = useState<string>("");
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
        supabase.from("channels").select("id, name, phone").eq("connected", true),
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

  const handleSave = async () => {
    if (!selectedChannel || !selectedAgent) {
      toast.error("Selecione um canal e um chatbot");
      return;
    }

    setIsSaving(true);
    try {
      // Check if config exists for this channel
      const { data: existing } = await supabase
        .from("chatbot_config")
        .select("id")
        .eq("channel_id", selectedChannel)
        .maybeSingle();

      if (existing) {
        // Update existing config
        const { error } = await supabase
          .from("chatbot_config")
          .update({
            agent_id: selectedAgent,
            is_enabled: isEnabled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Get user_id from the channel
        const { data: channel } = await supabase
          .from("channels")
          .select("user_id, organization_id")
          .eq("id", selectedChannel)
          .single();

        if (!channel) throw new Error("Canal não encontrado");

        // Create new config
        const { error } = await supabase.from("chatbot_config").insert({
          channel_id: selectedChannel,
          agent_id: selectedAgent,
          user_id: channel.user_id,
          organization_id: channel.organization_id,
          is_enabled: isEnabled,
        });

        if (error) throw error;
      }

      toast.success("Chatbot vinculado ao canal com sucesso!");
      onAssigned();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao vincular chatbot:", error);
      toast.error("Erro ao vincular chatbot ao canal");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedChannel("");
    setSelectedAgent("");
    setIsEnabled(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Vincular Chatbot a Canal
          </DialogTitle>
          <DialogDescription>
            Escolha qual chatbot será usado para atender as conversas de um canal específico.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Nenhum canal conectado
                    </div>
                  ) : (
                    channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4" />
                          <span>{channel.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({channel.phone})
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
                  O chatbot responderá automaticamente neste canal
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
          <Button onClick={handleSave} disabled={isSaving || !selectedChannel || !selectedAgent}>
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
