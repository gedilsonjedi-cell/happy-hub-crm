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
  Settings
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LeadCardMenu } from "@/components/pipeline/LeadCardMenu";
import { LeadDetailsDialog } from "@/components/pipeline/LeadDetailsDialog";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
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

const DEFAULT_STAGES = [
  { name: "Pré-Atendimento", color: "#3b82f6", order_index: 0 },
  { name: "Qualificação", color: "#f59e0b", order_index: 1 },
  { name: "Vendas", color: "#22c55e", order_index: 2 },
  { name: "Não finalizou venda", color: "#ef4444", order_index: 3 },
  { name: "Follow-up", color: "#8b5cf6", order_index: 4 },
  { name: "Cliente", color: "#10b981", order_index: 5 },
];

const Pipeline = () => {
  const { user } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
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

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch stages
    const { data: stagesData, error: stagesError } = await supabase
      .from("pipeline_stages")
      .select("*")
      .order("order_index");

    if (stagesError) {
      console.error("Error fetching stages:", stagesError);
    }

    // If no stages, create default ones
    if (!stagesData || stagesData.length === 0) {
      await createDefaultStages();
    } else {
      setStages(stagesData);
    }

    // Fetch leads
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
    }

    setLeads((leadsData || []) as Lead[]);
    setLoading(false);
  };

  const createDefaultStages = async () => {
    const inserts = DEFAULT_STAGES.map(stage => ({
      ...stage,
      user_id: user?.id,
    }));

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert(inserts)
      .select();

    if (error) {
      toast.error("Erro ao criar estágios padrão");
      return;
    }

    setStages(data || []);
  };

  const handleCreateStage = async () => {
    if (!stageForm.name.trim()) {
      toast.error("Preencha o nome do estágio");
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
    fetchData();
  };

  const handleLeadUpdated = () => {
    fetchData();
    setDetailsDialogOpen(false);
    setEditLeadDialogOpen(false);
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Pipeline</h1>
          <p className="text-muted-foreground">
            {leads.length} leads • {stages.length} estágios
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={openNewStage}>
            <Settings className="w-4 h-4" />
            Novo Estágio
          </Button>
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
    </MainLayout>
  );
};

export default Pipeline;
