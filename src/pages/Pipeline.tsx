import { useState, useEffect } from "react";
import { 
  Plus, 
  MoreVertical, 
  User, 
  Phone, 
  Mail,
  GripVertical,
  Trash2,
  Edit,
  Settings,
  ChevronDown,
  GitBranch
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { cn } from "@/lib/utils";
import { LeadCardMenu } from "@/components/pipeline/LeadCardMenu";
import { LeadDetailsDialog } from "@/components/pipeline/LeadDetailsDialog";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  organization_id: string | null;
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  pipeline_id: string | null;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  stage_id: string | null;
  tags: string[] | null;
  created_at: string;
  notes: string | null;
  city: string | null;
  state: string | null;
  document: string | null;
  custom_fields: Record<string, string> | null;
}

const DEFAULT_PIPELINE_ID = "00000000-0000-0000-0000-000000000001";

const Pipeline = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>(DEFAULT_PIPELINE_ID);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Lead management dialogs
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [editLeadDialogOpen, setEditLeadDialogOpen] = useState(false);

  const [stageForm, setStageForm] = useState({ name: "", color: "#22c55e" });
  const [leadForm, setLeadForm] = useState({ 
    name: "", 
    phone: "", 
    email: "",
    stageId: ""
  });
  const [pipelineForm, setPipelineForm] = useState({ name: "", description: "" });

  const currentPipeline = pipelines.find(p => p.id === selectedPipeline);
  const isDefaultPipeline = currentPipeline?.is_default ?? true;

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      fetchPipelines();
    }
  }, [user, effectiveOrganizationId]);

  useEffect(() => {
    if (selectedPipeline) {
      fetchStages();
    }
  }, [selectedPipeline]);

  const fetchPipelines = async () => {
    if (!effectiveOrganizationId) return;
    
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .eq("organization_id", effectiveOrganizationId)
      .order("is_default", { ascending: false });

    if (error) {
      console.error("Error fetching pipelines:", error);
      return;
    }

    setPipelines(data || []);
    
    // Select default pipeline if none selected
    if (data && data.length > 0 && !selectedPipeline) {
      setSelectedPipeline(data[0].id);
    }
    
    fetchLeads();
  };

  const fetchStages = async () => {
    setLoading(true);

    // Fetch stages for selected pipeline
    const { data: stagesData, error: stagesError } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", selectedPipeline)
      .order("order_index");

    if (stagesError) {
      console.error("Error fetching stages:", stagesError);
    }

    setStages(stagesData || []);
    setLoading(false);
  };

  const fetchLeads = async () => {
    if (!effectiveOrganizationId) return;
    
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", effectiveOrganizationId)
      .order("created_at", { ascending: false });

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
    }

    setLeads((leadsData || []) as Lead[]);
  };

  const handleCreatePipeline = async () => {
    if (!pipelineForm.name.trim()) {
      toast.error("Preencha o nome do pipeline");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .maybeSingle();

    const { data, error } = await supabase
      .from("pipelines")
      .insert({
        name: pipelineForm.name.trim(),
        description: pipelineForm.description.trim() || null,
        organization_id: profile?.organization_id,
        is_default: false,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar pipeline");
      console.error(error);
      return;
    }

    setPipelines([...pipelines, data]);
    setSelectedPipeline(data.id);
    setPipelineDialogOpen(false);
    setPipelineForm({ name: "", description: "" });
    toast.success("Pipeline criado!");
  };

  const handleDeletePipeline = async (id: string) => {
    const pipeline = pipelines.find(p => p.id === id);
    if (pipeline?.is_default) {
      toast.error("Não é possível excluir o pipeline padrão");
      return;
    }

    const { error } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir pipeline");
      return;
    }

    setPipelines(pipelines.filter(p => p.id !== id));
    if (selectedPipeline === id) {
      setSelectedPipeline(DEFAULT_PIPELINE_ID);
    }
    toast.success("Pipeline excluído!");
  };

  const handleCreateStage = async () => {
    if (!stageForm.name.trim()) {
      toast.error("Preencha o nome do estágio");
      return;
    }

    if (isDefaultPipeline) {
      toast.error("Não é possível adicionar estágios ao pipeline padrão");
      return;
    }

    const maxOrder = stages.reduce((max, s) => Math.max(max, s.order_index), -1);

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        user_id: user?.id,
        name: stageForm.name.trim(),
        color: stageForm.color,
        order_index: maxOrder + 1,
        pipeline_id: selectedPipeline,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar estágio");
      return;
    }

    setStages([...stages, data]);
    setStageDialogOpen(false);
    setStageForm({ name: "", color: "#22c55e" });
    toast.success("Estágio criado!");
  };

  const handleUpdateStage = async () => {
    if (!editingStage || !stageForm.name.trim()) return;

    const { error } = await supabase
      .from("pipeline_stages")
      .update({ name: stageForm.name.trim(), color: stageForm.color })
      .eq("id", editingStage.id);

    if (error) {
      toast.error("Erro ao atualizar estágio");
      return;
    }

    setStages(stages.map(s => 
      s.id === editingStage.id 
        ? { ...s, name: stageForm.name.trim(), color: stageForm.color }
        : s
    ));
    setEditingStage(null);
    setStageDialogOpen(false);
    setStageForm({ name: "", color: "#22c55e" });
    toast.success("Estágio atualizado!");
  };

  const handleDeleteStage = async (id: string) => {
    const { error } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir estágio");
      return;
    }

    setStages(stages.filter(s => s.id !== id));
    toast.success("Estágio excluído!");
  };

  const handleCreateLead = async () => {
    if (!leadForm.name.trim() || !leadForm.phone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: user?.id,
        name: leadForm.name.trim(),
        phone: leadForm.phone.trim(),
        email: leadForm.email.trim() || null,
        stage_id: leadForm.stageId || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar lead");
      return;
    }

    setLeads([data as Lead, ...leads]);
    setLeadDialogOpen(false);
    setLeadForm({ name: "", phone: "", email: "", stageId: "" });
    toast.success("Lead criado!");
  };

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedLead) return;

    const { error } = await supabase
      .from("leads")
      .update({ stage_id: stageId })
      .eq("id", draggedLead.id);

    if (error) {
      toast.error("Erro ao mover lead");
      return;
    }

    setLeads(leads.map(l => 
      l.id === draggedLead.id ? { ...l, stage_id: stageId } : l
    ));
    
    setDraggedLead(null);
    setDragOverStage(null);
    
    const stage = stages.find(s => s.id === stageId);
    toast.success(`Lead movido para ${stage?.name}`);
  };

  const getLeadsForStage = (stageId: string | null) => {
    if (stageId === null) {
      // For "unassigned" column, show leads that are either:
      // 1. Have no stage_id
      // 2. Have a stage_id that belongs to the current pipeline
      const currentPipelineStageIds = stages.map(s => s.id);
      return leads.filter(l => 
        l.stage_id === null || 
        !currentPipelineStageIds.includes(l.stage_id)
      );
    }
    return leads.filter(l => l.stage_id === stageId);
  };

  const openEditStage = (stage: PipelineStage) => {
    setEditingStage(stage);
    setStageForm({ name: stage.name, color: stage.color });
    setStageDialogOpen(true);
  };

  const openNewStage = () => {
    setEditingStage(null);
    setStageForm({ name: "", color: "#22c55e" });
    setStageDialogOpen(true);
  };

  const openNewLead = (stageId?: string) => {
    setLeadForm({ name: "", phone: "", email: "", stageId: stageId || "" });
    setLeadDialogOpen(true);
  };

  const handleEditLead = (lead: Lead) => {
    setSelectedLead(lead);
    setEditLeadDialogOpen(true);
  };

  const handleViewDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsDialogOpen(true);
  };

  const handleLeadDeleted = () => {
    fetchLeads();
  };

  const handleLeadUpdated = () => {
    fetchLeads();
    setDetailsDialogOpen(false);
    setEditLeadDialogOpen(false);
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Pipeline</h1>
            <p className="text-muted-foreground">
              {leads.length} leads • {stages.length} estágios
            </p>
          </div>
          
          {/* Pipeline Selector */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <GitBranch className="w-4 h-4" />
                  {currentPipeline?.name || "Pipeline Padrão"}
                  {currentPipeline?.is_default && (
                    <Badge variant="secondary" className="ml-1 text-xs">Padrão</Badge>
                  )}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {pipelines.map((pipeline) => (
                  <DropdownMenuItem
                    key={pipeline.id}
                    onClick={() => setSelectedPipeline(pipeline.id)}
                    className="flex items-center justify-between"
                  >
                    <span>{pipeline.name}</span>
                    {pipeline.is_default && (
                      <Badge variant="secondary" className="text-xs">Padrão</Badge>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPipelineDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Pipeline
                </DropdownMenuItem>
                {!isDefaultPipeline && (
                  <DropdownMenuItem 
                    onClick={() => handleDeletePipeline(selectedPipeline)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Pipeline
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isDefaultPipeline && (
            <Button variant="outline" className="gap-2" onClick={openNewStage}>
              <Settings className="w-4 h-4" />
              Novo Estágio
            </Button>
          )}
          <Button className="gap-2" onClick={() => openNewLead()}>
            <Plus className="w-4 h-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Pipeline Board */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Unassigned Column */}
          <div 
            className={cn(
              "flex-shrink-0 w-72 bg-card rounded-lg border transition-all",
              dragOverStage === "unassigned" 
                ? "border-primary shadow-lg" 
                : "border-border"
            )}
            onDragOver={(e) => handleDragOver(e, "unassigned")}
            onDragLeave={handleDragLeave}
            onDrop={() => {
              if (draggedLead) {
                supabase.from("leads").update({ stage_id: null }).eq("id", draggedLead.id)
                  .then(() => {
                    setLeads(leads.map(l => l.id === draggedLead.id ? { ...l, stage_id: null } : l));
                    setDraggedLead(null);
                    setDragOverStage(null);
                  });
              }
            }}
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#6b7280" }}
                />
                <span className="font-medium text-foreground">Sem estágio</span>
                <Badge variant="secondary" className="ml-1">
                  {getLeadsForStage(null).length}
                </Badge>
              </div>
            </div>
            <div className="p-2 space-y-2 min-h-[200px]">
              {getLeadsForStage(null).map(lead => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => handleDragStart(lead)}
                  className="group bg-muted/50 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground text-sm truncate">{lead.name}</p>
                        <LeadCardMenu
                          lead={lead}
                          onEdit={handleEditLead}
                          onViewDetails={handleViewDetails}
                          onDeleted={handleLeadDeleted}
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Phone className="w-3 h-3" />
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Columns */}
          {stages.map(stage => (
            <div 
              key={stage.id}
              className={cn(
                "flex-shrink-0 w-72 bg-card rounded-lg border transition-all",
                dragOverStage === stage.id 
                  ? "border-primary shadow-lg" 
                  : "border-border"
              )}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className="p-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-medium text-foreground">{stage.name}</span>
                  <Badge variant="secondary" className="ml-1">
                    {getLeadsForStage(stage.id).length}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border z-50">
                    <DropdownMenuItem 
                      className="gap-2 cursor-pointer"
                      onClick={() => openEditStage(stage)}
                    >
                      <Edit className="w-4 h-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="gap-2 cursor-pointer"
                      onClick={() => openNewLead(stage.id)}
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Lead
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="gap-2 cursor-pointer text-destructive"
                      onClick={() => handleDeleteStage(stage.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {getLeadsForStage(stage.id).map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead)}
                    className="group bg-muted/50 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-foreground text-sm truncate">{lead.name}</p>
                          <LeadCardMenu
                            lead={lead}
                            onEdit={handleEditLead}
                            onViewDetails={handleViewDetails}
                            onDeleted={handleLeadDeleted}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Phone className="w-3 h-3" />
                          <span>{lead.phone}</span>
                        </div>
                        {lead.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {lead.tags.slice(0, 2).map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {getLeadsForStage(stage.id).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Arraste leads aqui
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Stage Button */}
          <div className="flex-shrink-0 w-72">
            <Button
              variant="outline"
              className="w-full h-12 border-dashed gap-2"
              onClick={openNewStage}
            >
              <Plus className="w-4 h-4" />
              Adicionar Estágio
            </Button>
          </div>
        </div>
      )}

      {/* Stage Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingStage ? "Editar Estágio" : "Novo Estágio"}
            </DialogTitle>
            <DialogDescription>
              {editingStage ? "Atualize as informações do estágio" : "Crie um novo estágio no pipeline"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Nome</Label>
              <Input
                placeholder="Ex: Qualificação"
                className="bg-background border-border"
                value={stageForm.name}
                onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Cor</Label>
              <div className="flex gap-2">
                {["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"].map(color => (
                  <button
                    key={color}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      stageForm.color === color ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setStageForm({ ...stageForm, color })}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setStageDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={editingStage ? handleUpdateStage : handleCreateStage}>
                {editingStage ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Novo Lead</DialogTitle>
            <DialogDescription>
              Adicione um novo lead ao pipeline
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-foreground">Nome</Label>
              <Input
                placeholder="Nome do lead"
                className="bg-background border-border"
                value={leadForm.name}
                onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Telefone</Label>
              <Input
                placeholder="+5511999999999"
                className="bg-background border-border"
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Email (opcional)</Label>
              <Input
                placeholder="email@exemplo.com"
                className="bg-background border-border"
                value={leadForm.email}
                onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setLeadDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateLead}>
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lead Details Dialog */}
      <LeadDetailsDialog
        isOpen={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        lead={selectedLead}
        onUpdated={handleLeadUpdated}
      />

      {/* Edit Lead Dialog */}
      <EditLeadDialog
        open={editLeadDialogOpen}
        onOpenChange={setEditLeadDialogOpen}
        lead={selectedLead}
        onSuccess={handleLeadUpdated}
      />

      {/* Create Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Pipeline</DialogTitle>
            <DialogDescription>
              Crie um novo pipeline personalizado para organizar seus leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Pipeline de Vendas"
                value={pipelineForm.name}
                onChange={(e) => setPipelineForm({ ...pipelineForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descreva o propósito deste pipeline"
                value={pipelineForm.description}
                onChange={(e) => setPipelineForm({ ...pipelineForm, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPipelineDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreatePipeline}>
                Criar Pipeline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Pipeline;
