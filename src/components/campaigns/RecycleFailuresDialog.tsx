import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, Users, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";

interface RecycleFailuresDialogProps {
  campaign: {
    id: string;
    name: string;
    failed_count: number;
    sector_id?: string | null;
    chatbot_enabled?: boolean;
    chatbot_id?: string | null;
    min_interval?: number;
    max_interval?: number;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ChannelTemplate {
  channel_id: string;
  template_id: string;
}

interface MessageTemplate {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  name: string;
}

export function RecycleFailuresDialog({
  campaign,
  open,
  onOpenChange,
  onSuccess,
}: RecycleFailuresDialogProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [loading, setLoading] = useState(false);
  const [failedRecipients, setFailedRecipients] = useState<{ phone: string; name: string | null }[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<ChannelTemplate[]>([]);
  const [originalChannel, setOriginalChannel] = useState<string | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<string | null>(null);
  
  const [selectedTemplate, setSelectedTemplate] = useState<string>("same");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch failed recipients and original campaign data
  useEffect(() => {
    if (open && campaign) {
      fetchData();
    }
  }, [open, campaign]);

  const fetchData = async () => {
    if (!campaign || !effectiveOrganizationId) return;
    
    setLoading(true);
    try {
      // Fetch failed recipients
      const { data: recipients } = await supabase
        .from("campaign_recipients")
        .select("phone, name")
        .eq("campaign_id", campaign.id)
        .eq("status", "failed");
      
      setFailedRecipients(recipients || []);

      // Fetch original campaign channel and template
      const { data: campaignChannels } = await supabase
        .from("campaign_channels")
        .select("channel_id, template_id")
        .eq("campaign_id", campaign.id)
        .limit(1)
        .single();
      
      if (campaignChannels) {
        setOriginalChannel(campaignChannels.channel_id);
        setOriginalTemplate(campaignChannels.template_id);
      }

      // Fetch all templates
      const { data: templatesData } = await supabase
        .from("message_templates")
        .select("id, name")
        .eq("organization_id", effectiveOrganizationId)
        .eq("status", "approved");
      
      setTemplates(templatesData || []);

      // Fetch channels
      const { data: channelsData } = await supabase
        .from("channels")
        .select("id, name")
        .eq("organization_id", effectiveOrganizationId)
        .eq("connected", true)
        .neq("provider", "zapi");
      
      setChannels(channelsData || []);

      // Fetch channel-template relations
      const { data: ctData } = await supabase
        .from("channel_templates")
        .select("channel_id, template_id");
      
      setChannelTemplates(ctData || []);

      // Set default campaign name
      setNewCampaignName(`${campaign.name} - Reciclagem`);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get templates available for the original channel
  const availableTemplates = templates.filter(t => {
    if (!originalChannel) return true;
    return channelTemplates.some(ct => ct.channel_id === originalChannel && ct.template_id === t.id);
  });

  const handleRecycle = async () => {
    if (!campaign || !user || !effectiveOrganizationId || !originalChannel) {
      toast.error("Dados incompletos para criar nova campanha");
      return;
    }

    if (failedRecipients.length === 0) {
      toast.error("Nenhum destinatário com falha para reciclar");
      return;
    }

    if (!newCampaignName.trim()) {
      toast.error("Digite um nome para a nova campanha");
      return;
    }

    const templateToUse = selectedTemplate === "same" 
      ? originalTemplate 
      : selectedTemplate;

    if (!templateToUse) {
      toast.error("Selecione um template");
      return;
    }

    setIsCreating(true);
    try {
      // Create new campaign
      const { data: newCampaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          organization_id: effectiveOrganizationId,
          name: newCampaignName.trim(),
          sector_id: campaign.sector_id,
          chatbot_enabled: campaign.chatbot_enabled || false,
          chatbot_id: campaign.chatbot_id,
          dispatch_interval: campaign.min_interval || 5,
          min_interval: campaign.min_interval || 5,
          max_interval: campaign.max_interval || 120,
          use_unified_template: true,
          unified_template_id: templateToUse,
          status: "running",
          total_recipients: failedRecipients.length,
        })
        .select()
        .single();

      if (campaignError) {
        console.error("Campaign creation error:", campaignError);
        toast.error("Erro ao criar campanha de reciclagem");
        return;
      }

      // Create campaign channel
      const { error: channelError } = await supabase
        .from("campaign_channels")
        .insert({
          campaign_id: newCampaign.id,
          channel_id: originalChannel,
          template_id: templateToUse,
          order_index: 0,
        });

      if (channelError) {
        console.error("Channel insert error:", channelError);
        toast.error("Erro ao configurar canal da campanha");
        return;
      }

      // Create recipients
      const recipientInserts = failedRecipients.map(r => ({
        campaign_id: newCampaign.id,
        phone: r.phone,
        name: r.name,
        status: "pending",
      }));

      const { error: recipientError } = await supabase
        .from("campaign_recipients")
        .insert(recipientInserts);

      if (recipientError) {
        console.error("Recipients insert error:", recipientError);
        toast.error("Erro ao adicionar destinatários");
        return;
      }

      // Start the campaign
      supabase.functions.invoke('campaign-dispatch', {
        body: { 
          campaignId: newCampaign.id, 
          action: 'start',
          recipients: failedRecipients.map(r => r.phone)
        }
      }).catch(err => console.error("Dispatch error:", err));

      toast.success(`Campanha de reciclagem criada com ${failedRecipients.length} destinatários!`);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error creating recycle campaign:", error);
      toast.error("Erro ao criar campanha de reciclagem");
    } finally {
      setIsCreating(false);
    }
  };

  const originalTemplateName = templates.find(t => t.id === originalTemplate)?.name || "Template original";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <RefreshCw className="w-5 h-5 text-primary" />
            Reciclar Falhas
          </DialogTitle>
          <DialogDescription>
            Crie uma nova campanha apenas com os destinatários que falharam na campanha original.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando dados...
          </div>
        ) : failedRecipients.length === 0 ? (
          <div className="py-8 text-center">
            <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum destinatário com falha para reciclar</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-destructive" />
                <span className="font-medium text-foreground">
                  {failedRecipients.length} destinatários com falha
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Campanha original: <strong>{campaign?.name}</strong>
              </p>
            </div>

            {/* Campaign Name */}
            <div className="space-y-2">
              <Label>Nome da nova campanha</Label>
              <Input
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Nome da campanha de reciclagem"
                className="bg-background border-border"
              />
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Template para envio
              </Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Selecione o template" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="same">
                    Mesmo template ({originalTemplateName})
                  </SelectItem>
                  {availableTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Você pode usar o mesmo template ou escolher outro aprovado no mesmo canal.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleRecycle}
            disabled={isCreating || loading || failedRecipients.length === 0}
            className="gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Reciclar {failedRecipients.length} falhas
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
