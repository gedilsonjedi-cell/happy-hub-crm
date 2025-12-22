import { useState, useEffect } from "react";
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
  Archive
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { cn } from "@/lib/utils";

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
}

interface ChannelTemplateRelation {
  channel_id: string;
  template_id: string;
}

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  approved: { label: "Ativo", className: "bg-primary/10 text-primary border-primary/30", icon: Check },
  rejected: { label: "Rejeitado", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

const Templates = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    variables: "",
  });

  useEffect(() => {
    if (user) {
      fetchTemplates();
      fetchChannels();
    }
  }, [user]);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar templates");
      return;
    }

    setTemplates((data || []).map(t => ({
      ...t,
      status: t.status as "pending" | "approved" | "rejected"
    })));
    setLoading(false);
  };

  const fetchChannels = async () => {
    const { data: channelsData, error: channelsError } = await supabase
      .from("channels")
      .select("id, name, phone");

    if (channelsError) return;

    setChannels(channelsData || []);

    const { data: ctData } = await supabase
      .from("channel_templates")
      .select("channel_id, template_id");

    if (ctData) {
      const mapping: Record<string, string[]> = {};
      ctData.forEach(ct => {
        if (!mapping[ct.template_id]) mapping[ct.template_id] = [];
        mapping[ct.template_id].push(ct.channel_id);
      });
      setChannelTemplates(mapping);
    }
  };

  const handleCreateTemplate = async () => {
    if (!formData.name || !formData.content) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const variables = formData.variables
      .split(",")
      .map(v => v.trim())
      .filter(v => v);

    const { error } = await supabase.from("message_templates").insert({
      user_id: user?.id,
      name: formData.name,
      content: formData.content,
      variables,
    });

    if (error) {
      toast.error("Erro ao criar template");
      return;
    }

    toast.success("Template criado com sucesso!");
    setDialogOpen(false);
    setFormData({ name: "", content: "", variables: "" });
    fetchTemplates();
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

  // Get type based on availability
  const getTemplateType = (templateId: string) => {
    const approvedChannels = channelTemplates[templateId] || [];
    if (approvedChannels.length === 0) return "Resposta rápida";
    if (approvedChannels.length === 1) return "Atendimento";
    return "Atendimento\nCampanha\nSequência";
  };

  // Get availability text
  const getAvailability = (templateId: string) => {
    const approvedChannels = channelTemplates[templateId] || [];
    if (approvedChannels.length === 0) return "Somente para meu usuário";
    
    const channelPhones = approvedChannels.map(chId => {
      const ch = channels.find(c => c.id === chId);
      return ch?.phone || "";
    }).filter(Boolean);
    
    if (channelPhones.length > 0) {
      return channelPhones.slice(0, 1).join("\n") + (channelPhones.length > 1 ? `\n+${channelPhones.length - 1} mais` : "") + "\nToda a empresa";
    }
    return "Toda a empresa";
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    
    // Channel filter
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
          <Button variant="outline" className="gap-2" onClick={() => { fetchTemplates(); fetchChannels(); }}>
            <RefreshCw className="w-4 h-4" />
            Sincronizar
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Template</DialogTitle>
                <DialogDescription>
                  Crie um novo modelo de mensagem para suas campanhas
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Nome do Template</Label>
                  <Input
                    placeholder="Ex: Boas-vindas"
                    className="bg-muted/50 border-border"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Conteúdo da Mensagem</Label>
                  <Textarea
                    placeholder="Olá {nome}! Seja bem-vindo..."
                    className="bg-muted/50 border-border min-h-32"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{variavel}"} para campos dinâmicos
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Variáveis (separadas por vírgula)</Label>
                  <Input
                    placeholder="nome, telefone, empresa"
                    className="bg-muted/50 border-border"
                    value={formData.variables}
                    onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateTemplate}>
                    Criar Template
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
          <SelectContent className="bg-card border-border">
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
          <SelectContent className="bg-card border-border">
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
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_150px_200px_100px] gap-4 px-6 py-3 border-b border-border bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">Modelo</span>
          <span className="text-sm font-medium text-muted-foreground">Tipo</span>
          <span className="text-sm font-medium text-muted-foreground">Disponibilidade</span>
          <span className="text-sm font-medium text-muted-foreground text-right">Status</span>
        </div>

        {/* Table Body */}
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
              const availability = getAvailability(template.id);

              return (
                <div
                  key={template.id}
                  className="grid grid-cols-[1fr_150px_200px_100px] gap-4 px-6 py-4 hover:bg-muted/20 transition-colors group cursor-pointer"
                  onClick={() => openApprovalDialog(template)}
                >
                  {/* Template Name & Content */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center border border-border flex-shrink-0 mt-0.5">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground truncate">{template.name}</h3>
                        {template.variables && template.variables.length > 0 && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-400/30">
                            Marketing
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.content}
                      </p>
                    </div>
                  </div>

                  {/* Type */}
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground whitespace-pre-line leading-tight">
                      {templateType}
                    </span>
                  </div>

                  {/* Availability */}
                  <div className="flex items-center">
                    {approvedChannels.length > 0 ? (
                      <div className="space-y-1">
                        {approvedChannels.slice(0, 1).map(chId => {
                          const ch = channels.find(c => c.id === chId);
                          return ch ? (
                            <div key={chId} className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-primary" />
                              <span className="text-sm text-foreground">{ch.phone}</span>
                            </div>
                          ) : null;
                        })}
                        {approvedChannels.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            +{approvedChannels.length - 1} número(s)
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">Toda a empresa</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Somente para meu usuário</span>
                    )}
                  </div>

                  {/* Status */}
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

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Gerenciar Aprovações por Canal</DialogTitle>
            <DialogDescription>
              Selecione em quais canais o template "{selectedTemplate?.name}" está aprovado.
              Templates aprovados no mesmo WABA são compartilhados automaticamente.
            </DialogDescription>
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
                <DropdownMenuContent align="start" className="bg-card border-border">
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
    </MainLayout>
  );
};

export default Templates;
