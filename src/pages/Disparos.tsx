import { useState, useEffect } from "react";
import { 
  Send, 
  Plus, 
  Calendar,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  MoreVertical,
  Play,
  Pause,
  ArrowLeft,
  Settings2,
  Check,
  Shuffle,
  Timer,
  Smartphone,
  Eye,
  RefreshCw,
  Bot
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { CampaignDetailsDialog } from "@/components/campaigns/CampaignDetailsDialog";
import { CampaignProgressBar } from "@/components/campaigns/CampaignProgressBar";
import { RecipientSelection } from "@/components/campaigns/RecipientSelection";

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
  connected: boolean;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

interface ChannelTemplate {
  channel_id: string;
  template_id: string;
}

interface AIAgent {
  id: string;
  name: string;
  is_active: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "completed" | "failed";
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  scheduled_at?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  min_interval?: number;
  max_interval?: number;
  team?: string | null;
  chatbot_enabled?: boolean;
}

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
  scheduled: { label: "Agendada", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  running: { label: "Enviando", className: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Play },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

const Disparos = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channelTemplateRelations, setChannelTemplateRelations] = useState<ChannelTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<Record<string, string>>({});
  const [useUnifiedTemplate, setUseUnifiedTemplate] = useState(true);
  const [recipientData, setRecipientData] = useState<{ phones: string[]; source: "contacts" | "numbers" | null }>({
    phones: [],
    source: null
  });
  const [formData, setFormData] = useState({
    campaignName: "",
    team: "",
    chatbot: "disabled",
    chatbotSource: "channel" as "channel" | "custom",
    selectedChatbotId: "",
    startTime: "now",
    unifiedTemplate: "",
    minInterval: "5",
    maxInterval: "120"
  });

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      fetchData();
    }
  }, [user, effectiveOrganizationId]);

  // Demo data for presentation
  const demoChannel: Channel = {
    id: "demo-channel-1",
    name: "WhatsApp Vendas (Demo)",
    phone: "+5511999999999",
    provider: "meta",
    connected: true
  };

  const demoTemplates: MessageTemplate[] = [
    {
      id: "demo-template-1",
      name: "Boas-vindas",
      content: "Olá {{nome}}! 👋 Seja bem-vindo(a) à nossa empresa. Estamos felizes em tê-lo conosco!"
    },
    {
      id: "demo-template-2", 
      name: "Promoção Especial",
      content: "🎉 {{nome}}, temos uma oferta exclusiva para você! Aproveite 20% de desconto usando o cupom PROMO20."
    },
    {
      id: "demo-template-3",
      name: "Lembrete de Agendamento",
      content: "📅 Olá {{nome}}, lembrando do seu agendamento amanhã às {{horario}}. Confirme sua presença!"
    }
  ];

  const demoChannelTemplateRelations: ChannelTemplate[] = [
    { channel_id: "demo-channel-1", template_id: "demo-template-1" },
    { channel_id: "demo-channel-1", template_id: "demo-template-2" },
    { channel_id: "demo-channel-1", template_id: "demo-template-3" }
  ];

  const fetchData = async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);

    // Fetch channels - exclude Z-API channels (they can't be used for mass dispatches)
    const { data: channelsData } = await supabase
      .from("channels")
      .select("id, name, phone, provider, connected")
      .eq("organization_id", effectiveOrganizationId)
      .eq("connected", true)
      .neq("provider", "zapi");

    // Fetch templates (only approved ones for dispatching)
    const { data: templatesData } = await supabase
      .from("message_templates")
      .select("id, name, content")
      .eq("organization_id", effectiveOrganizationId)
      .eq("status", "approved");

    // Fetch channel-template relations
    const { data: ctData } = await supabase
      .from("channel_templates")
      .select("channel_id, template_id");

    // Fetch campaigns
    const { data: campaignsData } = await supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", effectiveOrganizationId)
      .order("created_at", { ascending: false });

    // Fetch AI agents
    const { data: agentsData } = await supabase
      .from("ai_agents")
      .select("id, name, is_active")
      .eq("organization_id", effectiveOrganizationId)
      .eq("is_active", true);

    // Combine real data with demo data
    const realChannels = channelsData || [];
    const realTemplates = templatesData || [];
    const realRelations = ctData || [];

    setChannels([demoChannel, ...realChannels]);
    setTemplates([...demoTemplates, ...realTemplates]);
    setChannelTemplateRelations([...demoChannelTemplateRelations, ...realRelations]);
    setCampaigns((campaignsData || []).map(c => ({
      ...c,
      status: c.status as Campaign["status"]
    })));
    setAiAgents(agentsData || []);
    setLoading(false);
  };

  // Get templates available for a specific channel
  const getTemplatesForChannel = (channelId: string) => {
    const approvedTemplateIds = channelTemplateRelations
      .filter(ct => ct.channel_id === channelId)
      .map(ct => ct.template_id);
    
    return templates.filter(t => approvedTemplateIds.includes(t.id));
  };

  // Get templates that are approved in ALL selected channels (for unified template)
  const getUnifiedTemplates = () => {
    if (selectedChannels.length === 0) return [];
    
    return templates.filter(template => {
      return selectedChannels.every(channelId => {
        return channelTemplateRelations.some(
          ct => ct.channel_id === channelId && ct.template_id === template.id
        );
      });
    });
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      const newSelected = prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId];
      
      if (!newSelected.includes(channelId)) {
        setChannelTemplates(current => {
          const updated = { ...current };
          delete updated[channelId];
          return updated;
        });
      }
      
      // Reset unified template if it's no longer valid
      if (useUnifiedTemplate) {
        const validUnified = templates.filter(template => {
          return newSelected.every(chId => {
            return channelTemplateRelations.some(
              ct => ct.channel_id === chId && ct.template_id === template.id
            );
          });
        });
        if (!validUnified.find(t => t.id === formData.unifiedTemplate)) {
          setFormData(prev => ({ ...prev, unifiedTemplate: "" }));
        }
      }
      
      return newSelected;
    });
  };

  const selectAllChannels = () => {
    if (selectedChannels.length === channels.length) {
      setSelectedChannels([]);
      setChannelTemplates({});
      setFormData(prev => ({ ...prev, unifiedTemplate: "" }));
    } else {
      setSelectedChannels(channels.map(c => c.id));
    }
  };

  const setChannelTemplate = (channelId: string, templateId: string) => {
    setChannelTemplates(prev => ({
      ...prev,
      [channelId]: templateId
    }));
  };

  const getSelectedTemplatesPreview = () => {
    if (useUnifiedTemplate && formData.unifiedTemplate) {
      const template = templates.find(t => t.id === formData.unifiedTemplate);
      return template ? [template] : [];
    }
    
    const previewTemplates: MessageTemplate[] = [];
    selectedChannels.forEach(chId => {
      const templateId = channelTemplates[chId];
      if (templateId) {
        const template = templates.find(t => t.id === templateId);
        if (template && !previewTemplates.find(t => t.id === template.id)) {
          previewTemplates.push(template);
        }
      }
    });
    return previewTemplates;
  };

  const handleCreateCampaign = async () => {
    // Prevent double clicks
    if (isCreating) return;
    
    if (!formData.campaignName || selectedChannels.length === 0) {
      toast.error("Preencha o nome da campanha e selecione pelo menos um canal");
      return;
    }

    if (recipientData.phones.length === 0) {
      toast.error("Selecione os destinatários da campanha");
      return;
    }

    if (useUnifiedTemplate && !formData.unifiedTemplate) {
      toast.error("Selecione um template");
      return;
    }

    if (!useUnifiedTemplate) {
      const allHaveTemplates = selectedChannels.every(chId => channelTemplates[chId]);
      if (!allHaveTemplates) {
        toast.error("Selecione um template para cada canal");
        return;
      }
    }

    // Block the button immediately
    setIsCreating(true);

    try {
      // If source is "numbers", create leads for the new numbers
      if (recipientData.source === "numbers") {
        const { data: existingLeads } = await supabase
          .from("leads")
          .select("phone")
          .in("phone", recipientData.phones);

        const existingPhones = new Set(existingLeads?.map(l => l.phone) || []);
        const newPhones = recipientData.phones.filter(p => !existingPhones.has(p));

        if (newPhones.length > 0) {
          // Get the current count for naming
          const { count } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .ilike("name", "LeadWhats-%");

          const startIndex = (count || 0) + 1;

          const newLeads = newPhones.map((phone, idx) => ({
            user_id: user?.id,
            name: `LeadWhats-${String(startIndex + idx).padStart(5, "0")}`,
            phone: phone,
            status: "new"
          }));

          const { error: leadsError } = await supabase
            .from("leads")
            .insert(newLeads);

          if (leadsError) {
            console.error("Error creating leads:", leadsError);
            toast.warning("Alguns contatos podem não ter sido salvos");
          }
        }
      }

      // Determine chatbot_id based on selection
      const chatbotId = formData.chatbot === "enabled" && formData.chatbotSource === "custom" 
        ? formData.selectedChatbotId || null 
        : null;

      // Create campaign with min/max intervals
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          user_id: user?.id,
          name: formData.campaignName,
          team: formData.team || null,
          chatbot_enabled: formData.chatbot === "enabled",
          chatbot_id: chatbotId,
          dispatch_interval: parseInt(formData.minInterval),
          min_interval: parseInt(formData.minInterval),
          max_interval: parseInt(formData.maxInterval),
          use_unified_template: useUnifiedTemplate,
          unified_template_id: useUnifiedTemplate ? formData.unifiedTemplate : null,
          status: formData.startTime === "now" ? "running" : "scheduled",
          total_recipients: recipientData.phones.length,
        })
        .select()
        .single();

      if (campaignError) {
        toast.error("Erro ao criar campanha");
        console.error("Campaign creation error:", campaignError);
        setIsCreating(false);
        return;
      }

      // Create campaign channels
      const channelInserts = selectedChannels.map((channelId, index) => ({
        campaign_id: campaign.id,
        channel_id: channelId,
        template_id: useUnifiedTemplate ? formData.unifiedTemplate : channelTemplates[channelId],
        order_index: index,
      }));

      const { error: channelsError } = await supabase
        .from("campaign_channels")
        .insert(channelInserts);

      if (channelsError) {
        toast.error("Erro ao salvar canais da campanha");
        setIsCreating(false);
        return;
      }

      // Close form and reset immediately to prevent double clicks
      setShowCreateForm(false);
      resetForm();

      // If starting now, trigger the campaign dispatch (in background)
      if (formData.startTime === "now") {
        toast.success(`Campanha iniciada! Enviando para ${recipientData.phones.length} destinatários...`);
        
        // Don't await - let it run in background
        supabase.functions.invoke('campaign-dispatch', {
          body: { 
            campaignId: campaign.id, 
            action: 'start',
            recipients: recipientData.phones
          }
        }).then(response => {
          if (response.error) {
            console.error("Dispatch error:", response.error);
          }
        }).catch(dispatchError => {
          console.error("Error triggering dispatch:", dispatchError);
        });
      } else {
        toast.success("Campanha agendada com sucesso!");
      }

      // Refresh data
      fetchData();
    } catch (error) {
      console.error("Error creating campaign:", error);
      toast.error("Erro ao criar campanha");
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedChannels([]);
    setChannelTemplates({});
    setUseUnifiedTemplate(true);
    setRecipientData({ phones: [], source: null });
    setFormData({
      campaignName: "",
      team: "",
      chatbot: "disabled",
      chatbotSource: "channel",
      selectedChatbotId: "",
      startTime: "now",
      unifiedTemplate: "",
      minInterval: "5",
      maxInterval: "120"
    });
  };

  const handleDeleteCampaign = async (id: string) => {
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir campanha");
      return;
    }
    toast.success("Campanha excluída");
    fetchData();
  };

  const handleViewDetails = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setSelectedCampaign(campaign);
      setShowDetailsDialog(true);
    }
  };

  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === "running").length,
    sent: campaigns.reduce((acc, c) => acc + c.sent_count, 0),
    deliveryRate: campaigns.reduce((acc, c) => acc + c.sent_count, 0) > 0
      ? Math.round((campaigns.reduce((acc, c) => acc + c.delivered_count, 0) / 
          campaigns.reduce((acc, c) => acc + c.sent_count, 0)) * 100)
      : 0,
  };

  if (showCreateForm) {
    const unifiedTemplates = getUnifiedTemplates();

    return (
      <MainLayout>
        {/* Header */}
        <div className="mb-6 animate-fade-in">
          <Button 
            variant="ghost" 
            className="gap-2 mb-4 text-muted-foreground hover:text-foreground"
            onClick={() => { setShowCreateForm(false); resetForm(); }}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold text-foreground mb-2">Configuração de campanha</h1>
          <p className="text-muted-foreground text-sm">
            Crie campanhas para engajar seus clientes. Selecione canais e templates aprovados.
          </p>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-border">
            <Smartphone className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum canal conectado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Conecte canais na página de Conexões para criar campanhas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slide-up">
            {/* Left Column */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-foreground">
                  Nome da campanha <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input 
                    placeholder="Digite o nome da campanha"
                    className="bg-card border-border"
                    value={formData.campaignName}
                    onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  />
                  {formData.campaignName && <Check className="w-5 h-5 text-primary" />}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Equipe</Label>
                <Select 
                  value={formData.team} 
                  onValueChange={(value) => setFormData({ ...formData, team: value })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="geral">Geral</SelectItem>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Channel Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">
                    Canais de disparo <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary hover:text-primary/80"
                    onClick={selectAllChannels}
                  >
                    {selectedChannels.length === channels.length ? "Desmarcar todos" : "Selecionar todos"}
                  </Button>
                </div>
                
                <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2 max-h-48 overflow-y-auto">
                  {channels.map((channel) => (
                    <div 
                      key={channel.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedChannels.includes(channel.id) 
                          ? "bg-primary/10 border-primary/50" 
                          : "bg-card border-border hover:border-primary/30"
                      )}
                      onClick={() => toggleChannel(channel.id)}
                    >
                      <Checkbox 
                        checked={selectedChannels.includes(channel.id)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Smartphone className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{channel.name}</p>
                        <p className="text-xs text-muted-foreground">{channel.phone}</p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  ))}
                </div>
                
                {selectedChannels.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <Check className="w-4 h-4" />
                    <span>{selectedChannels.length} canal(is) selecionado(s)</span>
                  </div>
                )}
              </div>

              {/* Recipient Selection */}
              <div className="space-y-3">
                <RecipientSelection onSelectionChange={setRecipientData} />
              </div>

              {/* Random Cadence Dispatch */}
              <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2">
                  <Shuffle className="w-5 h-5 text-primary" />
                  <Label className="text-foreground font-medium">Cadência Aleatória</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Os disparos serão realizados com intervalos aleatórios entre o mínimo e máximo definidos, 
                  evitando padrões detectáveis.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Timer className="w-4 h-4" />
                      Intervalo mínimo
                    </Label>
                    <Select 
                      value={formData.minInterval} 
                      onValueChange={(value) => {
                        const newMin = parseInt(value);
                        const currentMax = parseInt(formData.maxInterval);
                        if (newMin > currentMax) {
                          setFormData({ ...formData, minInterval: value, maxInterval: value });
                        } else {
                          setFormData({ ...formData, minInterval: value });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="5">5 segundos</SelectItem>
                        <SelectItem value="10">10 segundos</SelectItem>
                        <SelectItem value="15">15 segundos</SelectItem>
                        <SelectItem value="30">30 segundos</SelectItem>
                        <SelectItem value="45">45 segundos</SelectItem>
                        <SelectItem value="60">1 minuto</SelectItem>
                        <SelectItem value="90">1 min 30 seg</SelectItem>
                        <SelectItem value="120">2 minutos</SelectItem>
                        <SelectItem value="180">3 minutos</SelectItem>
                        <SelectItem value="240">4 minutos</SelectItem>
                        <SelectItem value="300">5 minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Timer className="w-4 h-4" />
                      Intervalo máximo
                    </Label>
                    <Select 
                      value={formData.maxInterval} 
                      onValueChange={(value) => {
                        const newMax = parseInt(value);
                        const currentMin = parseInt(formData.minInterval);
                        if (newMax < currentMin) {
                          setFormData({ ...formData, maxInterval: value, minInterval: value });
                        } else {
                          setFormData({ ...formData, maxInterval: value });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="5">5 segundos</SelectItem>
                        <SelectItem value="10">10 segundos</SelectItem>
                        <SelectItem value="15">15 segundos</SelectItem>
                        <SelectItem value="30">30 segundos</SelectItem>
                        <SelectItem value="45">45 segundos</SelectItem>
                        <SelectItem value="60">1 minuto</SelectItem>
                        <SelectItem value="90">1 min 30 seg</SelectItem>
                        <SelectItem value="120">2 minutos</SelectItem>
                        <SelectItem value="180">3 minutos</SelectItem>
                        <SelectItem value="240">4 minutos</SelectItem>
                        <SelectItem value="300">5 minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                  <Shuffle className="w-4 h-4 text-primary" />
                  <p className="text-xs text-primary">
                    Exemplo: disparos entre {formData.minInterval}s e {formData.maxInterval}s → 
                    {" "}{Math.floor(Math.random() * (parseInt(formData.maxInterval) - parseInt(formData.minInterval)) + parseInt(formData.minInterval))}s, 
                    {" "}{Math.floor(Math.random() * (parseInt(formData.maxInterval) - parseInt(formData.minInterval)) + parseInt(formData.minInterval))}s, 
                    {" "}{Math.floor(Math.random() * (parseInt(formData.maxInterval) - parseInt(formData.minInterval)) + parseInt(formData.minInterval))}s...
                  </p>
                </div>

                {selectedChannels.length > 1 && (
                  <p className="text-xs text-muted-foreground border-t border-border/50 pt-3 mt-2">
                    As mensagens também serão alternadas entre os {selectedChannels.length} canais selecionados.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-foreground">Habilitar chatbot</Label>
                <Select 
                  value={formData.chatbot} 
                  onValueChange={(value) => setFormData({ ...formData, chatbot: value, chatbotSource: "channel", selectedChatbotId: "" })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="disabled">Desabilitado</SelectItem>
                    <SelectItem value="enabled">Habilitado</SelectItem>
                  </SelectContent>
                </Select>

                {formData.chatbot === "enabled" && (
                  <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Bot className="w-4 h-4" />
                      <span className="font-medium">Configuração do Chatbot</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant={formData.chatbotSource === "channel" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setFormData({ ...formData, chatbotSource: "channel", selectedChatbotId: "" })}
                      >
                        Usar do canal
                      </Button>
                      <Button
                        variant={formData.chatbotSource === "custom" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setFormData({ ...formData, chatbotSource: "custom" })}
                      >
                        Escolher outro
                      </Button>
                    </div>

                    {formData.chatbotSource === "channel" ? (
                      <p className="text-xs text-muted-foreground">
                        O chatbot configurado em cada canal será usado automaticamente.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <Select 
                          value={formData.selectedChatbotId} 
                          onValueChange={(value) => setFormData({ ...formData, selectedChatbotId: value })}
                        >
                          <SelectTrigger className="bg-card border-border">
                            <SelectValue placeholder="Selecione o chatbot" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            {aiAgents.length === 0 ? (
                              <div className="p-3 text-center text-muted-foreground text-sm">
                                Nenhum chatbot configurado
                              </div>
                            ) : (
                              aiAgents.map(agent => (
                                <SelectItem key={agent.id} value={agent.id}>
                                  {agent.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Este chatbot será usado para todos os contatos desta campanha, independente da configuração do canal.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Início do disparo</Label>
                <Select 
                  value={formData.startTime} 
                  onValueChange={(value) => setFormData({ ...formData, startTime: value })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="now">Iniciar agora</SelectItem>
                    <SelectItem value="scheduled">Agendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary */}
              <div className="pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-primary font-medium">Canais selecionados:</span>
                  <span className="text-foreground">{selectedChannels.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary font-medium">Destinatários:</span>
                  <span className="text-foreground">
                    {recipientData.phones.length > 0 
                      ? `${recipientData.phones.length} (${recipientData.source === "contacts" ? "contatos" : "números"})`
                      : "Nenhum selecionado"
                    }
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary font-medium">Cadência:</span>
                  <span className="text-foreground flex items-center gap-1">
                    <Shuffle className="w-3 h-3" />
                    {formData.minInterval}s - {formData.maxInterval}s (aleatório)
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column - Templates */}
            <div className="space-y-5">
              <div className="space-y-3">
                <Label className="text-foreground">
                  Templates de Mensagem <span className="text-destructive">*</span>
                </Label>
                
                <div className="flex gap-2">
                  <Button
                    variant={useUnifiedTemplate ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setUseUnifiedTemplate(true)}
                  >
                    Mesmo template
                  </Button>
                  <Button
                    variant={!useUnifiedTemplate ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setUseUnifiedTemplate(false)}
                  >
                    Template por canal
                  </Button>
                </div>
              </div>

              {useUnifiedTemplate ? (
                <div className="space-y-3">
                  <Select 
                    value={formData.unifiedTemplate} 
                    onValueChange={(value) => setFormData({ ...formData, unifiedTemplate: value })}
                  >
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue placeholder="Selecione o template" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {unifiedTemplates.length === 0 ? (
                        <div className="p-3 text-center text-muted-foreground text-sm">
                          {selectedChannels.length === 0 
                            ? "Selecione canais primeiro"
                            : "Nenhum template aprovado em todos os canais"}
                        </div>
                      ) : (
                        unifiedTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Apenas templates aprovados em todos os canais selecionados são exibidos.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Selecione um template aprovado para cada canal.
                  </p>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedChannels.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        Selecione pelo menos um canal
                      </div>
                    ) : (
                      selectedChannels.map(chId => {
                        const channel = channels.find(c => c.id === chId);
                        const selectedTemplate = channelTemplates[chId];
                        const template = templates.find(t => t.id === selectedTemplate);
                        const availableTemplates = getTemplatesForChannel(chId);
                        
                        return (
                          <div 
                            key={chId}
                            className="p-3 bg-card rounded-lg border border-border space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-foreground flex-1">
                                {channel?.name}
                              </span>
                              {selectedTemplate && <Check className="w-4 h-4 text-primary" />}
                            </div>
                            <Select 
                              value={selectedTemplate || ""} 
                              onValueChange={(value) => setChannelTemplate(chId, value)}
                            >
                              <SelectTrigger className="bg-muted/50 border-border h-9">
                                <SelectValue placeholder="Selecione o template" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {availableTemplates.length === 0 ? (
                                  <div className="p-3 text-center text-muted-foreground text-sm">
                                    Nenhum template aprovado neste canal
                                  </div>
                                ) : (
                                  availableTemplates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {template && (
                              <p className="text-xs text-muted-foreground truncate">
                                {template.content.substring(0, 80)}...
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Message Preview */}
              <div 
                className="rounded-lg border border-border overflow-hidden"
                style={{ 
                  background: 'linear-gradient(135deg, hsl(160 10% 15%), hsl(160 10% 12%))',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
                }}
              >
                <div className="p-3 border-b border-border/50 bg-card/30">
                  <p className="text-xs text-muted-foreground">Prévia das mensagens</p>
                </div>
                <div className="min-h-48 max-h-64 overflow-y-auto p-4 space-y-3">
                  {getSelectedTemplatesPreview().length > 0 ? (
                    getSelectedTemplatesPreview().map((template, idx) => (
                      <div key={template.id} className="bg-card rounded-lg p-3 max-w-[85%] shadow-lg">
                        <Badge variant="outline" className="text-xs mb-2 bg-primary/10 border-primary/30 text-primary">
                          {template.name}
                        </Badge>
                        <p className="text-foreground text-sm">
                          {template.content.substring(0, 150)}...
                        </p>
                        <span className="text-xs text-muted-foreground mt-2 block text-right">12:0{idx}</span>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center py-12">
                      <p className="text-muted-foreground/50 text-sm text-center">
                        Selecione template(s) para visualizar
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {channels.length > 0 && (
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
            <Button 
              variant="outline" 
              onClick={() => { setShowCreateForm(false); resetForm(); }}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button 
              className="gap-2" 
              onClick={handleCreateCampaign}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Criar Campanha
                </>
              )}
            </Button>
          </div>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Disparos</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de mensagens</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={() => fetchData()}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button className="gap-2" onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total de Campanhas</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
            <Send className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Em Execução</p>
              <p className="text-2xl font-bold text-blue-400">{stats.running}</p>
            </div>
            <Play className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Mensagens Enviadas</p>
              <p className="text-2xl font-bold text-foreground">{stats.sent.toLocaleString()}</p>
            </div>
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Taxa de Entrega</p>
              <p className="text-2xl font-bold text-primary">{stats.deliveryRate}%</p>
            </div>
            <CheckCircle className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      {/* Real-time Progress Bar */}
      <CampaignProgressBar onViewDetails={handleViewDetails} />

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <Send className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma campanha criada</p>
            <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
              Criar primeira campanha
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/30">
                <TableHead className="text-muted-foreground">Campanha</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Destinatários</TableHead>
                <TableHead className="text-muted-foreground">Enviadas</TableHead>
                <TableHead className="text-muted-foreground">Entregues</TableHead>
                <TableHead className="text-muted-foreground">Falhas</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => {
                const config = statusConfig[campaign.status];
                const StatusIcon = config.icon;
                
                return (
                  <TableRow 
                    key={campaign.id}
                    className="border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => handleViewDetails(campaign.id)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {campaign.scheduled_at 
                            ? `Agendada: ${new Date(campaign.scheduled_at).toLocaleDateString()}`
                            : `Criada: ${new Date(campaign.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs gap-1", config.className)}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground">{campaign.total_recipients}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground">{campaign.sent_count}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-primary">{campaign.delivered_count}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-destructive">{campaign.failed_count}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => handleViewDetails(campaign.id)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem>Duplicar</DropdownMenuItem>
                          {campaign.status === "running" && (
                            <DropdownMenuItem>Pausar</DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDeleteCampaign(campaign.id)}
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Campaign Details Dialog */}
      <CampaignDetailsDialog
        campaign={selectedCampaign}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
      />
    </MainLayout>
  );
};

export default Disparos;
