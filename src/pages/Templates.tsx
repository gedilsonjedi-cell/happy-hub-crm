import { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  FileText, 
  Check, 
  Clock, 
  XCircle, 
  MoreVertical,
  Edit,
  Trash2,
  Smartphone,
  Search,
  RefreshCw,
  Camera,
  Video,
  File,
  Smile,
  Type,
  Link,
  Phone,
  MessageSquare,
  X
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { cn } from "@/lib/utils";

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  variable_mappings?: Record<string, string>;
  status: "pending" | "approved" | "rejected";
  dispatch_type: "marketing" | "utility" | "service";
  created_at: string;
  components?: any;
  header_media_url?: string | null;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
}

interface DetectedVariable {
  name: string;
  type: string;
  variable: string;
  example: string;
}

// Available contact fields for variable mapping
const contactFieldOptions = [
  { value: "manual", label: "Informar no momento do envio", icon: "edit", description: "Digitar o valor ao enviar" },
  { value: "contact_first_name", label: "Primeiro nome do contato", field: "first_name", description: "Automático do CRM" },
  { value: "contact_full_name", label: "Nome completo do contato", field: "name", description: "Automático do CRM" },
  { value: "contact_phone", label: "Telefone do contato", field: "phone", description: "Automático do CRM" },
  { value: "contact_email", label: "E-mail do contato", field: "email", description: "Automático do CRM" },
  { value: "contact_city", label: "Cidade do contato", field: "city", description: "Automático do CRM" },
  { value: "contact_state", label: "Estado do contato", field: "state", description: "Automático do CRM" },
  { value: "contact_document", label: "CPF/CNPJ do contato", field: "document", description: "Automático do CRM" },
  { value: "contact_notes", label: "Observações do contato", field: "notes", description: "Automático do CRM" },
];

interface CustomFieldDef {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
}

interface TemplateButton {
  id: string;
  type: "quick_reply" | "url" | "phone";
  label: string;
  value: string;
  isDynamic?: boolean; // For dynamic URL buttons
  dynamicVariable?: string; // Variable name for dynamic URL
}

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  approved: { label: "Ativo", className: "bg-primary/10 text-primary border-primary/30", icon: Check },
  rejected: { label: "Rejeitado", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

const buttonTypeConfig = {
  quick_reply: { label: "Resposta Rápida", icon: MessageSquare, placeholder: "Texto da resposta" },
  url: { label: "Link", icon: Link, placeholder: "https://exemplo.com" },
  phone: { label: "Telefone", icon: Phone, placeholder: "+5511999999999" },
};

const Templates = () => {
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { selectedOrganization, isImpersonating } = useSuperAdmin();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<Record<string, string[]>>({});
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [showButtonDialog, setShowButtonDialog] = useState(false);
  const [editVariableMappings, setEditVariableMappings] = useState<Record<string, string>>({});
  
  // New template form state
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    footerMessage: "",
    channel: "",
    availableFor: "all",
    category: "utility",
    isDraft: false,
    isArchived: false,
  });
  const [variableExamples, setVariableExamples] = useState<Record<string, string>>({});
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});
  const [selectedCustomField, setSelectedCustomField] = useState<Record<string, string>>({});
  const [templateButtons, setTemplateButtons] = useState<TemplateButton[]>([]);
  const [newButton, setNewButton] = useState<Omit<TemplateButton, "id">>({
    type: "quick_reply",
    label: "",
    value: "",
    isDynamic: false,
    dynamicVariable: "",
  });

  // Detect variables from content - simplified format [p1], [p2], etc.
  const detectedVariables = useMemo(() => {
    const regex = /\[p(\d+)\]/gi;
    const matches = formData.content.matchAll(regex);
    const vars: DetectedVariable[] = [];
    const seen = new Set<string>();
    
    for (const match of matches) {
      const num = match[1];
      const name = `p${num}`;
      if (!seen.has(name)) {
        seen.add(name);
        vars.push({
          name,
          type: "text",
          variable: "manual",
          example: variableExamples[name] || "",
        });
      }
    }
    // Sort by number
    return vars.sort((a, b) => parseInt(a.name.slice(1)) - parseInt(b.name.slice(1)));
  }, [formData.content, variableExamples]);

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      fetchTemplates();
      fetchChannels();
      fetchCustomFields();
    }
  }, [user, effectiveOrganizationId]);

  const fetchCustomFields = async () => {
    if (!effectiveOrganizationId) return;
    
    const { data, error } = await supabase
      .from("lead_custom_field_definitions")
      .select("id, field_name, field_label, field_type")
      .eq("organization_id", effectiveOrganizationId)
      .order("display_order");

    if (!error && data) {
      setCustomFields(data);
    }
  };

  const fetchTemplates = async () => {
    if (!effectiveOrganizationId) return;
    
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .eq("organization_id", effectiveOrganizationId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar templates");
      return;
    }

    setTemplates((data || []).map(t => ({
      ...t,
      status: t.status as "pending" | "approved" | "rejected",
      dispatch_type: (t.dispatch_type || "utility") as "marketing" | "utility" | "service",
      variable_mappings: (t.variable_mappings as Record<string, string> | null) || undefined,
      components: (t as any).components ?? null,
      header_media_url: (t as any).header_media_url ?? null,
    })));
    setLoading(false);
  };

  const fetchChannels = async () => {
    if (!effectiveOrganizationId) return;
    
    const { data: channelsData, error: channelsError } = await (supabase as any)
      .from("channels_public")
      .select("id, name, phone")
      .eq("organization_id", effectiveOrganizationId);

    if (channelsError) return;

    setChannels(channelsData || []);

    // Get channel IDs for this organization
    const orgChannelIds = (channelsData || []).map(c => c.id);

    // Only fetch channel_templates for channels in this organization
    if (orgChannelIds.length > 0) {
      const { data: ctData } = await supabase
        .from("channel_templates")
        .select("channel_id, template_id")
        .in("channel_id", orgChannelIds);

      if (ctData) {
        const mapping: Record<string, string[]> = {};
        ctData.forEach(ct => {
          if (!mapping[ct.template_id]) mapping[ct.template_id] = [];
          mapping[ct.template_id].push(ct.channel_id);
        });
        setChannelTemplates(mapping);
      }
    } else {
      setChannelTemplates({});
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      content: "",
      footerMessage: "",
      channel: "",
      availableFor: "all",
      category: "utility",
      isDraft: false,
      isArchived: false,
    });
    setVariableExamples({});
    setVariableMappings({});
    setSelectedCustomField({});
    setTemplateButtons([]);
  };

  const handleAddButton = () => {
    if (!newButton.label.trim()) {
      toast.error("Preencha o texto do botão");
      return;
    }
    // For URL buttons: validate either static URL or dynamic field is selected
    if (newButton.type === "url") {
      if (newButton.isDynamic) {
        if (!newButton.dynamicVariable) {
          toast.error("Selecione o campo personalizado para o link dinâmico");
          return;
        }
      } else {
        if (!newButton.value.trim()) {
          toast.error("Preencha a URL do botão");
          return;
        }
      }
    } else if (newButton.type === "phone" && !newButton.value.trim()) {
      toast.error("Preencha o número de telefone");
      return;
    }
    if (newButton.label.length > 25) {
      toast.error("O texto do botão deve ter no máximo 25 caracteres");
      return;
    }
    if (templateButtons.length >= 3) {
      toast.error("Máximo de 3 botões por template");
      return;
    }

    setTemplateButtons(prev => [
      ...prev,
      {
        ...newButton,
        id: crypto.randomUUID(),
        value: newButton.type === "quick_reply" ? newButton.label : (newButton.isDynamic ? `{{${newButton.dynamicVariable}}}` : newButton.value),
      }
    ]);
    setNewButton({ type: "quick_reply", label: "", value: "", isDynamic: false, dynamicVariable: "" });
    setShowButtonDialog(false);
    toast.success("Botão adicionado");
  };

  const handleRemoveButton = (id: string) => {
    setTemplateButtons(prev => prev.filter(b => b.id !== id));
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateTemplate = async () => {
    if (!formData.name.trim()) {
      toast.error("Preencha o nome do template");
      return;
    }
    if (!formData.content.trim()) {
      toast.error("Preencha o conteúdo da mensagem");
      return;
    }
    if (!formData.channel) {
      toast.error("Selecione um canal");
      return;
    }
    if (formData.name.length > 100) {
      toast.error("Nome deve ter no máximo 100 caracteres");
      return;
    }
    if (formData.content.length > 1000) {
      toast.error("Conteúdo deve ter no máximo 1000 caracteres");
      return;
    }

    // Validate variable examples are filled
    const missingExamples = detectedVariables.filter(v => !variableExamples[v.name]?.trim());
    if (missingExamples.length > 0) {
      toast.error(`Preencha o exemplo para: ${missingExamples.map(v => `[${v.name}]`).join(', ')}`);
      return;
    }

    const variables = detectedVariables.map(v => v.name);

    // Build variable mappings object with custom field info
    const mappingsToSave: Record<string, string> = {};
    detectedVariables.forEach(v => {
      const mapping = variableMappings[v.name] || "manual";
      if (mapping.startsWith("custom_field:")) {
        // Already in the correct format (direct selection from dropdown)
        mappingsToSave[v.name] = mapping;
      } else if (mapping === "custom_field" && selectedCustomField[v.name]) {
        // Legacy two-step format
        mappingsToSave[v.name] = `custom_field:${selectedCustomField[v.name]}`;
      } else {
        mappingsToSave[v.name] = mapping;
      }
    });

    setIsSubmitting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Sessão expirada. Faça login novamente.");
        setIsSubmitting(false);
        return;
      }

      // Map category to Meta format
      const categoryMap: Record<string, string> = {
        utility: 'UTILITY',
        marketing: 'MARKETING',
        authentication: 'AUTHENTICATION',
      };

      // Call edge function to create template on Meta
      const response = await supabase.functions.invoke('meta-create-template', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          name: formData.name.trim(),
          content: formData.content.trim(),
          category: categoryMap[formData.category] || 'UTILITY',
          channel_id: formData.channel,
          footer: formData.footerMessage,
          variables,
          variable_examples: variableExamples,
          variable_mappings: mappingsToSave,
          buttons: templateButtons.map(btn => ({
            type: btn.type,
            label: btn.label,
            value: btn.value,
            isDynamic: btn.isDynamic || false,
            dynamicVariable: btn.dynamicVariable || "",
          })),
        },
      });

      if (response.error) {
        console.error('Create template error:', response.error);
        toast.error(response.error.message || "Erro ao criar template");
        setIsSubmitting(false);
        return;
      }

      const result = response.data;
      
      if (result.error) {
        toast.error(result.message || result.error);
      } else {
        toast.success(result.message || "Template enviado para análise!");
        setDialogOpen(false);
        resetForm();
        await fetchTemplates();
        await fetchChannels();
      }
    } catch (error) {
      console.error('Create template error:', error);
      toast.error("Erro ao criar template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from("message_templates").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao excluir template");
      return;
    }

    toast.success("Template excluído");
    fetchTemplates();
  };

  // Open edit dialog to configure template variables
  const openEditDialog = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setEditVariableMappings(template.variable_mappings || {});
    setSelectedChannels(channelTemplates[template.id] || []);
    setEditDialogOpen(true);
  };

  const handleSaveVariableMappings = async () => {
    if (!selectedTemplate) return;

    const { error } = await supabase
      .from("message_templates")
      .update({ variable_mappings: editVariableMappings })
      .eq("id", selectedTemplate.id);

    if (error) {
      toast.error("Erro ao salvar configurações");
      return;
    }

    // Also save channel approvals
    await supabase
      .from("channel_templates")
      .delete()
      .eq("template_id", selectedTemplate.id);

    if (selectedChannels.length > 0) {
      const inserts = selectedChannels.map(channelId => ({
        channel_id: channelId,
        template_id: selectedTemplate.id,
      }));

      await supabase.from("channel_templates").insert(inserts);
    }

    const newStatus = selectedChannels.length > 0 ? "approved" : "pending";
    await supabase
      .from("message_templates")
      .update({ status: newStatus })
      .eq("id", selectedTemplate.id);

    toast.success("Configurações salvas!");
    setEditDialogOpen(false);
    fetchTemplates();
    fetchChannels();
  };

  const openApprovalDialog = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setSelectedChannels(channelTemplates[template.id] || []);
    setApprovalDialogOpen(true);
  };

  const handleSaveApprovals = async () => {
    if (!selectedTemplate) return;

    await supabase
      .from("channel_templates")
      .delete()
      .eq("template_id", selectedTemplate.id);

    if (selectedChannels.length > 0) {
      const inserts = selectedChannels.map(channelId => ({
        channel_id: channelId,
        template_id: selectedTemplate.id,
      }));

      const { error } = await supabase.from("channel_templates").insert(inserts);

      if (error) {
        toast.error("Erro ao salvar aprovações");
        return;
      }
    }

    const newStatus = selectedChannels.length > 0 ? "approved" : "pending";
    await supabase
      .from("message_templates")
      .update({ status: newStatus })
      .eq("id", selectedTemplate.id);

    toast.success("Aprovações salvas!");
    setApprovalDialogOpen(false);
    fetchTemplates();
    fetchChannels();
  };

  const toggleChannelApproval = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const getTemplateType = (templateId: string) => {
    const approvedChannels = channelTemplates[templateId] || [];
    // Always show universal type as per requirement
    if (approvedChannels.length > 0) {
      return "Atendimento\nCampanha\nSequência";
    }
    return "Atendimento\nCampanha\nSequência";
  };

  const getChannelNames = (templateId: string) => {
    const templateChannelIds = channelTemplates[templateId] || [];
    if (templateChannelIds.length === 0) return null;
    
    const channelNames = templateChannelIds
      .map(id => channels.find(c => c.id === id)?.name)
      .filter(Boolean);
    
    return channelNames;
  };

  const handleSyncFromMeta = async () => {
    // SuperAdmin must select an organization first
    if (isSuperAdmin && !isImpersonating) {
      toast.error("Selecione uma organização para sincronizar");
      return;
    }

    const orgName = selectedOrganization?.name;
    if (orgName) {
      toast.info(`Sincronizando templates para: ${orgName}`);
    }

    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Sessão expirada. Faça login novamente.");
        setSyncing(false);
        return;
      }

      // If SuperAdmin is impersonating, pass the organization_id
      const body = isSuperAdmin && selectedOrganization 
        ? { organization_id: selectedOrganization.id }
        : undefined;

      const response = await supabase.functions.invoke('meta-sync-templates', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
      });

      if (response.error) {
        console.error('Sync error:', response.error);
        toast.error(response.error.message || "Erro ao sincronizar templates");
        setSyncing(false);
        return;
      }

      const result = response.data;
      
      if (result.error) {
        toast.error(result.message || result.error);
      } else {
        toast.success(result.message || `${result.stats?.created || 0} novos, ${result.stats?.updated || 0} atualizados`);
        await fetchTemplates();
        await fetchChannels();
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error("Erro ao sincronizar templates da Meta");
    } finally {
      setSyncing(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    
    let matchesChannel = true;
    if (channelFilter !== "all") {
      const templateChannels = channelTemplates[t.id] || [];
      matchesChannel = templateChannels.includes(channelFilter);
    }
    
    return matchesSearch && matchesStatus && matchesChannel;
  });

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Modelos de mensagem</h1>
          <p className="text-muted-foreground text-sm">{filteredTemplates.length} modelos encontrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={handleSyncFromMeta}
            disabled={syncing}
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando..." : "Sincronizar Meta"}
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Digite para pesquisar..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-card border-border">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="approved">Ativos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[180px] bg-card border-border">
            <SelectValue placeholder="Todos os canais" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            <SelectItem value="all">Todos os canais</SelectItem>
            {channels.map(channel => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            className="data-[state=checked]:bg-primary"
          />
          <span className="text-sm text-muted-foreground">Arquivados</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        <div className="grid grid-cols-[1fr_150px_200px_100px] gap-4 px-6 py-3 border-b border-border bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">Modelo</span>
          <span className="text-sm font-medium text-muted-foreground">Tipo</span>
          <span className="text-sm font-medium text-muted-foreground">Disponibilidade</span>
          <span className="text-sm font-medium text-muted-foreground text-right">Status</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum template encontrado</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              Criar primeiro template
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTemplates.map((template) => {
              const config = statusConfig[template.status];
              const approvedChannels = channelTemplates[template.id] || [];
              const templateType = getTemplateType(template.id);

              return (
                <div
                  key={template.id}
                  className="grid grid-cols-[1fr_150px_200px_100px] gap-4 px-6 py-4 hover:bg-muted/20 transition-colors group cursor-pointer"
                  onClick={() => openEditDialog(template)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center border border-border flex-shrink-0 mt-0.5">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground truncate">{template.name}</h3>
                        {template.dispatch_type === "marketing" && (
                          <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-400/30">
                            Marketing
                          </Badge>
                        )}
                        {template.dispatch_type === "utility" && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-400/30">
                            Utilidade
                          </Badge>
                        )}
                        {template.dispatch_type === "service" && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-400/30">
                            Serviço
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.content}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground whitespace-pre-line leading-tight">
                      {templateType}
                    </span>
                  </div>

                  <div className="flex items-center">
                    {approvedChannels.length > 0 ? (
                      <div className="space-y-1">
                        {approvedChannels.slice(0, 2).map(chId => {
                          const ch = channels.find(c => c.id === chId);
                          return ch ? (
                            <div key={chId} className="flex items-center gap-2">
                              <Smartphone className="w-3.5 h-3.5 text-primary" />
                              <span className="text-sm text-foreground truncate max-w-[150px]" title={`${ch.name} (${ch.phone})`}>
                                {ch.name}
                              </span>
                            </div>
                          ) : null;
                        })}
                        {approvedChannels.length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{approvedChannels.length - 2} canal(is)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Sem canal vinculado</span>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs font-medium",
                        template.status === "approved" 
                          ? "bg-primary/20 text-primary border-primary/30" 
                          : config.className
                      )}
                    >
                      {template.status === "approved" ? "ATIVO" : config.label.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-foreground text-xl">Modelo de mensagem</DialogTitle>
            <p className="text-sm text-muted-foreground">Campanha</p>
          </DialogHeader>
          
          <div className="flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Left Column - Message Preview */}
            <div className="lg:w-[340px] flex-shrink-0">
              <div className="bg-muted/30 rounded-xl border border-border p-4">
                {/* Media Buttons */}
                <div className="flex justify-center gap-3 mb-4">
                  <button className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors border border-primary/20">
                    <Camera className="w-5 h-5 text-primary" />
                  </button>
                  <button className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors border border-primary/20">
                    <Video className="w-5 h-5 text-primary" />
                  </button>
                  <button className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors border border-primary/20">
                    <File className="w-5 h-5 text-primary" />
                  </button>
                </div>

                {/* Message Text Area */}
                <div className="relative">
                  <Textarea
                    placeholder={"Digite sua mensagem aqui...\nUse [p1], [p2], [p3]... para adicionar parâmetros dinâmicos"}
                    className="bg-background border-border min-h-[180px] resize-none pr-10 text-sm"
                    value={formData.content}
                    onChange={(e) => {
                      if (e.target.value.length <= 1000) {
                        setFormData({ ...formData, content: e.target.value });
                      }
                    }}
                    maxLength={1000}
                  />
                  <button className="absolute right-3 bottom-3 text-muted-foreground hover:text-foreground transition-colors">
                    <Smile className="w-5 h-5" />
                  </button>
                  <span className="absolute right-3 top-3 text-xs text-muted-foreground">
                    {formData.content.length}/1000
                  </span>
                </div>

                {/* Footer Message */}
                <div className="mt-3">
                  <Input
                    placeholder="Mensagem de rodapé"
                    className="bg-background border-border text-sm"
                    value={formData.footerMessage}
                    onChange={(e) => {
                      if (e.target.value.length <= 60) {
                        setFormData({ ...formData, footerMessage: e.target.value });
                      }
                    }}
                    maxLength={60}
                  />
                  <span className="text-xs text-muted-foreground mt-1 block text-right">
                    {formData.footerMessage.length}/60
                  </span>
                </div>

                {/* Action Buttons Preview */}
                {templateButtons.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {templateButtons.map((btn) => {
                      const config = buttonTypeConfig[btn.type];
                      const Icon = config.icon;
                      return (
                        <div 
                          key={btn.id} 
                          className="flex items-center justify-between bg-background rounded-lg border border-border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-primary" />
                            <span className="text-sm text-foreground">{btn.label}</span>
                          </div>
                          <button 
                            onClick={() => handleRemoveButton(btn.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Button */}
                <Button 
                  variant="ghost" 
                  className="w-full mt-3 text-primary hover:text-primary hover:bg-primary/10 border border-dashed border-primary/30"
                  onClick={() => setShowButtonDialog(true)}
                  disabled={templateButtons.length >= 3}
                >
                  {templateButtons.length >= 3 ? "Máximo de 3 botões" : "Adicionar botão"}
                </Button>
              </div>
            </div>

            {/* Right Column - Form Fields */}
            <div className="flex-1 space-y-5">
              {/* Name and Channel Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">
                    Nome <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="Nome do template"
                      className="bg-background border-border pr-16"
                      value={formData.name}
                      onChange={(e) => {
                        if (e.target.value.length <= 100) {
                          setFormData({ ...formData, name: e.target.value });
                        }
                      }}
                      maxLength={100}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {formData.name.length}/100
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">
                    Canal <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Selecione o canal" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      {channels.length === 0 ? (
                        <div className="p-3 text-center text-muted-foreground text-sm">
                          Nenhum canal disponível
                        </div>
                      ) : (
                        channels.map(channel => (
                          <SelectItem key={channel.id} value={channel.id}>
                            {channel.phone}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Available For and Category Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">
                    Disponível para <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formData.availableFor} onValueChange={(v) => setFormData({ ...formData, availableFor: v })}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Todas as equipes</SelectItem>
                      <SelectItem value="sales">Vendas</SelectItem>
                      <SelectItem value="support">Suporte</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-1">
                    Categoria <span className="text-destructive">*</span>
                    <span className="text-muted-foreground text-xs">ⓘ</span>
                  </Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="utility">Utilidade</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="authentication">Autenticação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Parameters Section - With Variable Mapping */}
              {detectedVariables.length > 0 && (
                <div className="border-t border-border pt-5">
                  <div className="mb-4">
                    <h3 className="font-medium text-foreground">Parâmetros detectados</h3>
                    <p className="text-sm text-muted-foreground">
                      Preencha o exemplo e configure a origem de cada parâmetro
                    </p>
                  </div>

                  <div className="space-y-4">
                    {detectedVariables.map((variable) => (
                      <div key={variable.name} className="bg-muted/20 rounded-lg p-4 border border-border space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                            <span className="text-sm font-bold text-primary">[{variable.name}]</span>
                          </div>
                          <span className="text-sm text-muted-foreground">Parâmetro {variable.name}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Example value */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Exemplo (obrigatório)</Label>
                            <Input
                              placeholder={`Ex: João`}
                              className="bg-background border-border"
                              value={variableExamples[variable.name] || ""}
                              onChange={(e) => {
                                if (e.target.value.length <= 100) {
                                  setVariableExamples(prev => ({
                                    ...prev,
                                    [variable.name]: e.target.value
                                  }));
                                }
                              }}
                              maxLength={100}
                            />
                          </div>
                          
                          {/* Variable mapping source */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Origem do valor no disparo</Label>
                            <Select 
                              value={variableMappings[variable.name] || "manual"}
                              onValueChange={(value) => {
                                setVariableMappings(prev => ({
                                  ...prev,
                                  [variable.name]: value
                                }));
                                // Clear custom field selection if not custom_field
                                if (value !== "custom_field") {
                                  setSelectedCustomField(prev => {
                                    const newState = { ...prev };
                                    delete newState[variable.name];
                                    return newState;
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="bg-background border-border">
                                <SelectValue placeholder="Selecione a origem" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border z-50">
                                {contactFieldOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex flex-col">
                                      <span className={option.value === "manual" ? "text-warning font-medium" : ""}>
                                        {option.label}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                                {customFields.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t border-border mt-1 pt-2">
                                      Campos Personalizados
                                    </div>
                                    {customFields.map(field => (
                                      <SelectItem key={`cf_${field.id}`} value={`custom_field:${field.field_name}`}>
                                        <span className="text-primary font-medium">{field.field_label}</span>
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                                {customFields.length === 0 && (
                                  <SelectItem value="custom_field" disabled>
                                    <span className="text-muted-foreground">Nenhum campo personalizado</span>
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Show selected mapping description */}
                        <p className="text-xs text-muted-foreground">
                          {variableMappings[variable.name] === "manual" || !variableMappings[variable.name]
                            ? "⚠️ Será solicitado informar o valor ao disparar mensagem"
                            : variableMappings[variable.name]?.startsWith("custom_field:")
                            ? `✓ Será preenchido com o campo "${customFields.find(f => f.field_name === variableMappings[variable.name]?.replace('custom_field:', ''))?.field_label || variableMappings[variable.name]?.replace('custom_field:', '')}"`
                            : "✓ Será preenchido automaticamente com dados do lead no CRM"
                          }
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-3">
                    <strong>Dica:</strong> Use [p1], [p2], [p3]... no texto da mensagem para adicionar parâmetros dinâmicos.
                  </p>
                </div>
              )}
              
              {/* Empty state for parameters */}
              {detectedVariables.length === 0 && (
                <div className="border-t border-border pt-5">
                  <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-dashed border-border">
                    <Type className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Use <code className="bg-muted px-1.5 py-0.5 rounded text-primary">[p1]</code> <code className="bg-muted px-1.5 py-0.5 rounded text-primary">[p2]</code> no conteúdo para adicionar parâmetros</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isArchived}
                  onCheckedChange={(checked) => setFormData({ ...formData, isArchived: checked })}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-sm text-muted-foreground">Arquivado</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isDraft}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDraft: checked })}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-sm text-muted-foreground">Rascunho</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
                Voltar
              </Button>
              <Button onClick={handleCreateTemplate} disabled={isSubmitting}>
                {isSubmitting ? "Enviando para Meta..." : "Enviar para Análise"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Button Dialog */}
      <Dialog open={showButtonDialog} onOpenChange={setShowButtonDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Adicionar botão</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Tipo de botão</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(buttonTypeConfig) as Array<keyof typeof buttonTypeConfig>).map((type) => {
                  const config = buttonTypeConfig[type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                        newButton.type === type
                          ? "bg-primary/10 border-primary/50 text-primary"
                          : "bg-muted/30 border-border text-muted-foreground hover:border-primary/30"
                      )}
                      onClick={() => setNewButton({ ...newButton, type })}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Texto do botão</Label>
              <div className="relative">
                <Input
                  placeholder="Ex: Falar com vendas"
                  className="bg-background border-border pr-12"
                  value={newButton.label}
                  onChange={(e) => {
                    if (e.target.value.length <= 25) {
                      setNewButton({ ...newButton, label: e.target.value });
                    }
                  }}
                  maxLength={25}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {newButton.label.length}/25
                </span>
              </div>
            </div>

            {newButton.type === "url" && (
              <div className="space-y-4">
                {/* Dynamic URL Toggle */}
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <Switch
                    checked={newButton.isDynamic || false}
                    onCheckedChange={(checked) => setNewButton({ 
                      ...newButton, 
                      isDynamic: checked,
                      value: checked ? "" : newButton.value,
                      dynamicVariable: checked ? newButton.dynamicVariable : ""
                    })}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Link Dinâmico</p>
                    <p className="text-xs text-muted-foreground">
                      O link será personalizado para cada contato
                    </p>
                  </div>
                </div>

                {newButton.isDynamic ? (
                  <div className="space-y-2">
                    <Label className="text-foreground">Campo personalizado</Label>
                    <Select
                      value={newButton.dynamicVariable || ""}
                      onValueChange={(v) => setNewButton({ ...newButton, dynamicVariable: v })}
                    >
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Selecione o campo com o link" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border z-50">
                        {customFields.length === 0 ? (
                          <div className="p-3 text-center text-muted-foreground text-sm">
                            Nenhum campo personalizado cadastrado.
                            <br />
                            <span className="text-xs">Vá em Personalização → Campos Personalizados</span>
                          </div>
                        ) : (
                          customFields.map(field => (
                            <SelectItem key={field.id} value={field.field_name}>
                              {field.field_label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      💡 Ao disparar, o sistema buscará o link no campo personalizado de cada contato
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-foreground">URL estática</Label>
                    <Input
                      placeholder={buttonTypeConfig.url.placeholder}
                      className="bg-background border-border"
                      value={newButton.value}
                      onChange={(e) => setNewButton({ ...newButton, value: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {newButton.type === "phone" && (
              <div className="space-y-2">
                <Label className="text-foreground">Número de telefone</Label>
                <Input
                  placeholder={buttonTypeConfig.phone.placeholder}
                  className="bg-background border-border"
                  value={newButton.value}
                  onChange={(e) => setNewButton({ ...newButton, value: e.target.value })}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowButtonDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddButton}>
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Gerenciar Aprovações por Canal</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione em quais canais o template "{selectedTemplate?.name}" está aprovado.
              Templates aprovados no mesmo WABA são compartilhados automaticamente.
            </p>
          </DialogHeader>
          <div className="space-y-3 mt-4 max-h-64 overflow-y-auto">
            {channels.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhum canal cadastrado
              </p>
            ) : (
              channels.map(channel => (
                <div
                  key={channel.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    selectedChannels.includes(channel.id)
                      ? "bg-primary/10 border-primary/50"
                      : "bg-muted/30 border-border hover:border-primary/30"
                  )}
                  onClick={() => toggleChannelApproval(channel.id)}
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
                  {selectedChannels.includes(channel.id) && (
                    <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">
                      Aprovado
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-border mt-4">
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border z-50">
                  <DropdownMenuItem className="gap-2 cursor-pointer">
                    <Edit className="w-4 h-4" />
                    Editar Template
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="gap-2 cursor-pointer text-destructive"
                    onClick={() => {
                      if (selectedTemplate) {
                        handleDeleteTemplate(selectedTemplate.id);
                        setApprovalDialogOpen(false);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveApprovals}>
                Salvar Aprovações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-foreground text-xl">
              Configurar Template
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedTemplate?.name}
            </p>
          </DialogHeader>
          
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] space-y-6">
            {/* Template Content Preview */}
            <div className="bg-muted/20 rounded-lg p-4 border border-border">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Conteúdo do template</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {selectedTemplate?.content}
              </p>
            </div>

            {/* Variable Mappings */}
            <div>
              <h3 className="font-medium text-foreground mb-2">Configuração de Variáveis</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Defina como cada variável será preenchida ao enviar mensagens.
              </p>

              {selectedTemplate?.variables && selectedTemplate.variables.length > 0 ? (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr] gap-4 px-4 py-2 bg-muted/30 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">Variável</span>
                    <span className="text-xs font-medium text-muted-foreground">Origem do valor</span>
                  </div>
                  
                  <div className="divide-y divide-border">
                    {selectedTemplate.variables.map((varName) => {
                      const currentMapping = editVariableMappings[varName] || "manual";
                      
                      return (
                        <div key={varName} className="grid grid-cols-[1fr_1fr] gap-4 px-4 py-3 items-center">
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm font-mono text-primary">
                              [{varName}]
                            </code>
                          </div>
                          <Select 
                            value={currentMapping.startsWith('custom_field:') ? currentMapping : currentMapping}
                            onValueChange={(value) => {
                              setEditVariableMappings(prev => ({
                                ...prev,
                                [varName]: value
                              }));
                            }}
                          >
                            <SelectTrigger className="bg-background border-border">
                              <SelectValue placeholder="Selecione a origem" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border z-50">
                              {contactFieldOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <span className={option.value === "manual" ? "text-primary font-medium" : ""}>
                                    {option.label}
                                  </span>
                                </SelectItem>
                              ))}
                              {customFields.length > 0 && (
                                <>
                                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t border-border mt-1 pt-2">
                                    Campos Personalizados
                                  </div>
                                  {customFields.map(field => (
                                    <SelectItem key={`cf_${field.id}`} value={`custom_field:${field.field_name}`}>
                                      <span className="text-primary font-medium">{field.field_label}</span>
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Helper text */}
                  <div className="px-4 py-3 bg-muted/10 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      <strong>Dica:</strong> Selecione um campo do contato para preencher automaticamente 
                      com os dados cadastrados, ou escolha "Informar no momento do envio" para digitar 
                      o valor manualmente ao criar uma campanha.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-border">
                  Este template não possui variáveis.
                </div>
              )}
            </div>

            {/* Channel Approvals */}
            <div>
              <h3 className="font-medium text-foreground mb-2">Canais Aprovados</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Selecione em quais canais este template está disponível.
              </p>
              
              <div className="space-y-2">
                {channels.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4 bg-muted/20 rounded-lg border border-border">
                    Nenhum canal cadastrado
                  </p>
                ) : (
                  channels.map(channel => (
                    <div
                      key={channel.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedChannels.includes(channel.id)
                          ? "bg-primary/10 border-primary/50"
                          : "bg-muted/30 border-border hover:border-primary/30"
                      )}
                      onClick={() => toggleChannelApproval(channel.id)}
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
                      {selectedChannels.includes(channel.id) && (
                        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">
                          Aprovado
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-border bg-muted/20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-card border-border z-50">
                <DropdownMenuItem 
                  className="gap-2 cursor-pointer text-destructive"
                  onClick={() => {
                    if (selectedTemplate) {
                      handleDeleteTemplate(selectedTemplate.id);
                      setEditDialogOpen(false);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveVariableMappings}>
                Salvar Configurações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Templates;
