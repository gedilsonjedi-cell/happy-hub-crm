import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, Users, MessageSquare, Phone } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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

interface ChannelTemplateRelation {
  channel_id: string;
  template_id: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  variables?: string[] | null;
  variable_mappings?: Record<string, string> | null;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
}

function getManualVariables(template: MessageTemplate): string[] {
  if (!template.variables) return [];
  return template.variables.filter(varName => {
    const mapping = template.variable_mappings?.[varName];
    return !mapping || mapping === '' || mapping === 'manual';
  });
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
  const [failedRecipients, setFailedRecipients] = useState<{ phone: string; name: string | null; status?: string }[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTemplateRelations, setChannelTemplateRelations] = useState<ChannelTemplateRelation[]>([]);
  const [originalChannel, setOriginalChannel] = useState<string | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<string | null>(null);

  // Multi-select channels: list of selected channel IDs
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("same");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [manualVariables, setManualVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && campaign) {
      fetchData();
    }
  }, [open, campaign?.id]);

  // When selected channels or template change, reset variables
  useEffect(() => {
    const templateId = selectedTemplate === "same" ? originalTemplate : selectedTemplate;
    if (!templateId) {
      setManualVariables({});
      return;
    }
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      setManualVariables({});
      return;
    }
    const vars = getManualVariables(template);
    const newVals: Record<string, string> = {};
    vars.forEach(v => { newVals[v] = manualVariables[v] || ''; });
    setManualVariables(newVals);
  }, [selectedTemplate, templates, originalTemplate]);

  const fetchData = async () => {
    if (!campaign || !effectiveOrganizationId) return;

    setLoading(true);
    try {
      // Pagina em lotes de 1000 para garantir que TODOS os destinatários
      // com falha sejam carregados, mesmo em campanhas grandes (>1000).
      // Sem isso, a reciclagem perdia destinatários silenciosamente.
      const PAGE = 1000;
      const allFailed: typeof failedRecipients = [];
      let from = 0;
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from("campaign_recipients")
          .select("phone, name, status, delivered_at, last_error_code")
          .eq("campaign_id", campaign.id)
          .or("status.eq.failed,and(status.eq.sent,delivered_at.is.null)")
          .range(from, from + PAGE - 1);
        if (batchError) throw batchError;
        const rows = batch || [];
        // Exclui apenas "sem WhatsApp" (erro Meta 131026). Todos os demais
        // erros (API, timeout, rate limit, etc.) continuam sendo reciclados.
        allFailed.push(...rows.filter((r: any) => r.last_error_code !== "131026"));
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      setFailedRecipients(allFailed);

      const { data: campaignChannels } = await supabase
        .from("campaign_channels")
        .select("channel_id, template_id")
        .eq("campaign_id", campaign.id)
        .limit(1)
        .single();

      if (campaignChannels) {
        setOriginalChannel(campaignChannels.channel_id);
        setOriginalTemplate(campaignChannels.template_id);
        setSelectedChannelIds([campaignChannels.channel_id]);
      }

      const { data: templatesData } = await supabase
        .from("message_templates")
        .select("id, name, variables, variable_mappings")
        .eq("organization_id", effectiveOrganizationId)
        .eq("status", "approved");

      setTemplates((templatesData as MessageTemplate[]) || []);

      const { data: channelsData } = await (supabase as any)
        .from("channels_public")
        .select("id, name, phone")
        .eq("organization_id", effectiveOrganizationId)
        .eq("connected", true)
        .neq("provider", "zapi");

      setChannels(channelsData || []);

      const { data: ctData } = await supabase
        .from("channel_templates")
        .select("channel_id, template_id");

      setChannelTemplateRelations(ctData || []);

      setNewCampaignName(`${campaign.name} - Reciclagem`);
      setSelectedTemplate("same");
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleChannelSelection = (channelId: string) => {
    setSelectedChannelIds(prev => {
      if (prev.includes(channelId)) {
        if (prev.length === 1) return prev; // must have at least 1
        return prev.filter(id => id !== channelId);
      }
      return [...prev, channelId];
    });
    // Reset template to avoid invalid selection
    setSelectedTemplate("");
  };

  // Templates available across ALL selected channels
  const availableTemplates = templates.filter(t =>
    selectedChannelIds.every(chId =>
      channelTemplateRelations.some(ct => ct.channel_id === chId && ct.template_id === t.id)
    )
  );

  const effectiveTemplateId = selectedTemplate === "same" ? originalTemplate : selectedTemplate;
  const effectiveTemplate = templates.find(t => t.id === effectiveTemplateId);
  const currentManualVars = effectiveTemplate ? getManualVariables(effectiveTemplate) : [];

  const handleRecycle = async () => {
    if (!campaign || !user || !effectiveOrganizationId || selectedChannelIds.length === 0) {
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

    const templateToUse = selectedTemplate === "same" ? originalTemplate : selectedTemplate;
    if (!templateToUse) {
      toast.error("Selecione um template");
      return;
    }

    // Validate manual variables
    const emptyVars = currentManualVars.filter(v => !manualVariables[v]?.trim());
    if (emptyVars.length > 0) {
      toast.error(`Preencha as variáveis: ${emptyVars.join(", ")}`);
      return;
    }

    setIsCreating(true);
    try {
      const useUnified = selectedChannelIds.length === 1;
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
          use_unified_template: useUnified,
          unified_template_id: useUnified ? templateToUse : null,
          status: "running",
          total_recipients: failedRecipients.length,
          manual_variables: Object.keys(manualVariables).length > 0 ? manualVariables : null,
        })
        .select()
        .single();

      if (campaignError) {
        toast.error("Erro ao criar campanha de reciclagem");
        return;
      }

      // Create campaign channels
      const channelInserts = selectedChannelIds.map((chId, idx) => ({
        campaign_id: newCampaign.id,
        channel_id: chId,
        template_id: templateToUse,
        order_index: idx,
      }));

      const { error: channelError } = await supabase
        .from("campaign_channels")
        .insert(channelInserts);

      if (channelError) {
        toast.error("Erro ao configurar canais da campanha");
        return;
      }

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
        toast.error("Erro ao adicionar destinatários");
        return;
      }

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
      <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[90vh] overflow-y-auto">
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
          <div className="py-8 text-center text-muted-foreground">Carregando dados...</div>
        ) : failedRecipients.length === 0 ? (
          <div className="py-8 text-center">
            <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum destinatário para reenviar</p>
            <p className="text-sm text-muted-foreground mt-2">Todas as mensagens foram entregues com sucesso!</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-warning" />
                <span className="font-medium text-foreground">
                  {failedRecipients.length} destinatários não entregues
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Campanha original: <strong>{campaign?.name}</strong>
              </p>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                <span className="text-destructive">
                  • {failedRecipients.filter(r => r.status === "failed").length} falhas confirmadas
                </span>
                <span className="text-warning">
                  • {failedRecipients.filter(r => r.status === "sent").length} aguardando Meta
                </span>
              </div>
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

            {/* Multi-Select Channels */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Canais para envio (selecione um ou mais)
              </Label>
              <div className="space-y-2 p-3 bg-background rounded-lg border border-border max-h-40 overflow-y-auto">
                {channels.map(channel => (
                  <div key={channel.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`ch-${channel.id}`}
                      checked={selectedChannelIds.includes(channel.id)}
                      onCheckedChange={() => toggleChannelSelection(channel.id)}
                    />
                    <label
                      htmlFor={`ch-${channel.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {channel.name} <span className="text-muted-foreground">({channel.phone})</span>
                      {channel.id === originalChannel && (
                        <span className="text-primary text-xs ml-1">(original)</span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedChannelIds.length} canal(is) selecionado(s). Os destinatários serão distribuídos entre eles.
              </p>
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Template para envio
              </Label>
              <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Selecione o template" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {originalTemplate && selectedChannelIds.includes(originalChannel || "") && (
                    <SelectItem value="same">
                      Mesmo template ({originalTemplateName})
                    </SelectItem>
                  )}
                  {availableTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.variables && template.variables.length > 0 && ` (${template.variables.length} var.)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas templates aprovados em todos os canais selecionados são exibidos.
              </p>
            </div>

            {/* Manual Variables */}
            {currentManualVars.length > 0 && (
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium text-sm">Variáveis do template</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preencha as variáveis que serão substituídas no envio.
                </p>
                {currentManualVars.map(varName => (
                  <div key={varName}>
                    <Label className="text-xs mb-1 block">{varName}</Label>
                    <Input
                      value={manualVariables[varName] || ""}
                      onChange={(e) => setManualVariables(prev => ({ ...prev, [varName]: e.target.value }))}
                      placeholder={`Valor para ${varName}`}
                      className="bg-background border-border h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancelar
          </Button>
          <Button
            onClick={handleRecycle}
            disabled={isCreating || loading || failedRecipients.length === 0 || !effectiveTemplateId}
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
                Reenviar {failedRecipients.length} não entregues
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
