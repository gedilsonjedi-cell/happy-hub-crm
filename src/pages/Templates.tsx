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
  Search
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  approved: { label: "Aprovado", className: "bg-primary/10 text-primary border-primary/30", icon: Check },
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

    // Fetch channel-template relationships
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

    // Remove existing approvals
    await supabase
      .from("channel_templates")
      .delete()
      .eq("template_id", selectedTemplate.id);

    // Add new approvals
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

    // Update template status
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

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Templates de Mensagem</h1>
          <p className="text-muted-foreground">Gerencie seus modelos de mensagem aprovados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Template
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total de Templates</p>
              <p className="text-2xl font-bold text-foreground">{templates.length}</p>
            </div>
            <FileText className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Aprovados</p>
              <p className="text-2xl font-bold text-primary">
                {templates.filter(t => t.status === "approved").length}
              </p>
            </div>
            <Check className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold text-warning">
                {templates.filter(t => t.status === "pending").length}
              </p>
            </div>
            <Clock className="w-6 h-6 text-warning" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar templates..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-card border-border">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="approved">Aprovados</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up">
        {loading ? (
          <p className="text-muted-foreground col-span-full text-center py-12">Carregando...</p>
        ) : filteredTemplates.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum template encontrado</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              Criar primeiro template
            </Button>
          </div>
        ) : (
          filteredTemplates.map((template) => {
            const config = statusConfig[template.status];
            const StatusIcon = config.icon;
            const approvedChannels = channelTemplates[template.id] || [];

            return (
              <div
                key={template.id}
                className="bg-card rounded-lg border border-border p-5 hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{template.name}</h3>
                    <Badge variant="outline" className={cn("text-xs mt-1", config.className)}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem 
                        className="gap-2 cursor-pointer"
                        onClick={() => openApprovalDialog(template)}
                      >
                        <Smartphone className="w-4 h-4" />
                        Gerenciar Canais
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Edit className="w-4 h-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="gap-2 cursor-pointer text-destructive"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 mb-3">
                  <p className="text-sm text-foreground line-clamp-3">
                    {template.content}
                  </p>
                </div>

                {template.variables && template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.variables.map((v, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {`{${v}}`}
                      </Badge>
                    ))}
                  </div>
                )}

                {approvedChannels.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Aprovado em:</p>
                    <div className="flex flex-wrap gap-1">
                      {approvedChannels.slice(0, 3).map(chId => {
                        const ch = channels.find(c => c.id === chId);
                        return ch ? (
                          <Badge key={chId} variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">
                            {ch.name.replace("WhatsApp ", "")}
                          </Badge>
                        ) : null;
                      })}
                      {approvedChannels.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{approvedChannels.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Gerenciar Aprovações</DialogTitle>
            <DialogDescription>
              Selecione em quais canais o template "{selectedTemplate?.name}" está aprovado
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
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveApprovals}>
              Salvar Aprovações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Templates;
