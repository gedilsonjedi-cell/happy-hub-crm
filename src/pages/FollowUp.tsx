import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Clock, 
  MessageSquare, 
  Play,
  Pause,
  Users,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FollowUpSequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  messages?: FollowUpMessage[];
}

interface FollowUpMessage {
  id: string;
  sequence_id: string;
  template_id: string;
  day_offset: number;
  send_time: string;
  order_index: number;
  template?: {
    id: string;
    name: string;
    content: string;
  };
}

interface Template {
  id: string;
  name: string;
  content: string;
  status: string;
}

interface FollowUpInstance {
  id: string;
  lead_id: string;
  sequence_id: string;
  status: string;
  started_at: string;
  next_message_index: number;
  lead?: {
    name: string;
    phone: string;
  };
  sequence?: {
    name: string;
  };
}

const FollowUp = () => {
  const { user } = useAuth();
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instances, setInstances] = useState<FollowUpInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddMessageDialog, setShowAddMessageDialog] = useState(false);
  const [editingSequence, setEditingSequence] = useState<FollowUpSequence | null>(null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  
  // Form states
  const [newSequenceName, setNewSequenceName] = useState("");
  const [newSequenceDescription, setNewSequenceDescription] = useState("");
  const [newMessageTemplateId, setNewMessageTemplateId] = useState("");
  const [newMessageDayOffset, setNewMessageDayOffset] = useState("1");
  const [newMessageSendTime, setNewMessageSendTime] = useState("10:00");

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch sequences with messages
      const { data: sequencesData, error: sequencesError } = await supabase
        .from("follow_up_sequences")
        .select("*")
        .order("created_at", { ascending: false });

      if (sequencesError) throw sequencesError;

      // Fetch messages for each sequence
      const sequencesWithMessages = await Promise.all(
        (sequencesData || []).map(async (seq) => {
          const { data: messagesData } = await supabase
            .from("follow_up_messages")
            .select("*")
            .eq("sequence_id", seq.id)
            .order("order_index", { ascending: true });

          // Fetch template info for each message
          const messagesWithTemplates = await Promise.all(
            (messagesData || []).map(async (msg) => {
              const { data: templateData } = await supabase
                .from("message_templates")
                .select("id, name, content")
                .eq("id", msg.template_id)
                .single();
              
              return { ...msg, template: templateData };
            })
          );

          return { ...seq, messages: messagesWithTemplates };
        })
      );

      setSequences(sequencesWithMessages);

      // Fetch approved templates
      const { data: templatesData } = await supabase
        .from("message_templates")
        .select("id, name, content, status")
        .eq("status", "approved")
        .order("name");

      setTemplates(templatesData || []);

      // Fetch active instances
      const { data: instancesData } = await supabase
        .from("follow_up_instances")
        .select("*")
        .eq("status", "active")
        .order("started_at", { ascending: false });

      // Fetch lead and sequence info for instances
      const instancesWithInfo = await Promise.all(
        (instancesData || []).map(async (inst) => {
          const { data: leadData } = await supabase
            .from("leads")
            .select("name, phone")
            .eq("id", inst.lead_id)
            .single();

          const seq = sequencesWithMessages.find(s => s.id === inst.sequence_id);

          return {
            ...inst,
            lead: leadData,
            sequence: seq ? { name: seq.name } : null
          };
        })
      );

      setInstances(instancesWithInfo);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSequence = async () => {
    if (!newSequenceName.trim()) {
      toast.error("Digite um nome para a sequência");
      return;
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      const { error } = await supabase
        .from("follow_up_sequences")
        .insert({
          name: newSequenceName,
          description: newSequenceDescription || null,
          organization_id: profile?.organization_id
        });

      if (error) throw error;

      toast.success("Sequência criada com sucesso");
      setShowCreateDialog(false);
      setNewSequenceName("");
      setNewSequenceDescription("");
      fetchData();
    } catch (error) {
      console.error("Error creating sequence:", error);
      toast.error("Erro ao criar sequência");
    }
  };

  const handleUpdateSequence = async () => {
    if (!editingSequence) return;

    try {
      const { error } = await supabase
        .from("follow_up_sequences")
        .update({
          name: newSequenceName,
          description: newSequenceDescription || null
        })
        .eq("id", editingSequence.id);

      if (error) throw error;

      toast.success("Sequência atualizada");
      setShowEditDialog(false);
      setEditingSequence(null);
      fetchData();
    } catch (error) {
      console.error("Error updating sequence:", error);
      toast.error("Erro ao atualizar sequência");
    }
  };

  const handleDeleteSequence = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta sequência?")) return;

    try {
      const { error } = await supabase
        .from("follow_up_sequences")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Sequência excluída");
      fetchData();
    } catch (error) {
      console.error("Error deleting sequence:", error);
      toast.error("Erro ao excluir sequência");
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("follow_up_sequences")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) throw error;

      toast.success(isActive ? "Sequência desativada" : "Sequência ativada");
      fetchData();
    } catch (error) {
      console.error("Error toggling sequence:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const handleAddMessage = async () => {
    if (!selectedSequenceId || !newMessageTemplateId) {
      toast.error("Selecione um template");
      return;
    }

    try {
      const sequence = sequences.find(s => s.id === selectedSequenceId);
      const orderIndex = sequence?.messages?.length || 0;

      const { error } = await supabase
        .from("follow_up_messages")
        .insert({
          sequence_id: selectedSequenceId,
          template_id: newMessageTemplateId,
          day_offset: parseInt(newMessageDayOffset),
          send_time: newMessageSendTime,
          order_index: orderIndex
        });

      if (error) throw error;

      toast.success("Mensagem adicionada");
      setShowAddMessageDialog(false);
      setNewMessageTemplateId("");
      setNewMessageDayOffset("1");
      setNewMessageSendTime("10:00");
      fetchData();
    } catch (error) {
      console.error("Error adding message:", error);
      toast.error("Erro ao adicionar mensagem");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("follow_up_messages")
        .delete()
        .eq("id", messageId);

      if (error) throw error;

      toast.success("Mensagem removida");
      fetchData();
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Erro ao remover mensagem");
    }
  };

  const handleCancelInstance = async (instanceId: string) => {
    try {
      const { error } = await supabase
        .from("follow_up_instances")
        .update({ status: "cancelled" })
        .eq("id", instanceId);

      if (error) throw error;

      toast.success("Follow-up cancelado");
      fetchData();
    } catch (error) {
      console.error("Error cancelling instance:", error);
      toast.error("Erro ao cancelar follow-up");
    }
  };

  const openEditDialog = (sequence: FollowUpSequence) => {
    setEditingSequence(sequence);
    setNewSequenceName(sequence.name);
    setNewSequenceDescription(sequence.description || "");
    setShowEditDialog(true);
  };

  const openAddMessageDialog = (sequenceId: string) => {
    setSelectedSequenceId(sequenceId);
    setShowAddMessageDialog(true);
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Follow-up</h1>
            <p className="text-muted-foreground">
              Configure sequências automáticas de mensagens para acompanhamento de leads
            </p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nova Sequência
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Sequência de Follow-up</DialogTitle>
                <DialogDescription>
                  Crie uma nova sequência para envio automático de mensagens
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da sequência</Label>
                  <Input
                    placeholder="Ex: Follow-up Produto X"
                    value={newSequenceName}
                    onChange={(e) => setNewSequenceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    placeholder="Descreva o objetivo desta sequência..."
                    value={newSequenceDescription}
                    onChange={(e) => setNewSequenceDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateSequence}>
                  Criar Sequência
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active Instances */}
        {instances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                Follow-ups Ativos ({instances.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-60">
                <div className="space-y-2">
                  {instances.map((instance) => (
                    <div
                      key={instance.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <div>
                          <p className="font-medium text-sm">
                            {instance.lead?.name || instance.lead?.phone}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {instance.sequence?.name} • Iniciado em {format(new Date(instance.started_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInstance(instance.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Pause className="w-4 h-4 mr-1" />
                        Parar
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Sequences List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sequências Configuradas</h2>
          
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : sequences.length === 0 ? (
            <Card className="p-8 text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2">Nenhuma sequência configurada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie sua primeira sequência de follow-up para começar
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Sequência
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {sequences.map((sequence) => (
                <Card key={sequence.id}>
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedSequence(expandedSequence === sequence.id ? null : sequence.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {expandedSequence === sequence.id ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                          <h3 className="font-medium">{sequence.name}</h3>
                        </div>
                        <Badge variant={sequence.is_active ? "default" : "secondary"}>
                          {sequence.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {sequence.messages?.length || 0} mensagens
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={sequence.is_active}
                          onCheckedChange={() => handleToggleActive(sequence.id, sequence.is_active)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(sequence)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteSequence(sequence.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {sequence.description && (
                      <p className="text-sm text-muted-foreground mt-1 ml-6">
                        {sequence.description}
                      </p>
                    )}
                  </div>

                  {/* Expanded Messages */}
                  {expandedSequence === sequence.id && (
                    <div className="border-t border-border p-4 bg-muted/20">
                      <div className="space-y-3">
                        {sequence.messages?.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma mensagem configurada
                          </p>
                        ) : (
                          sequence.messages?.map((msg, index) => (
                            <div
                              key={msg.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm">
                                  {index + 1}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                    <span className="font-medium text-sm">
                                      {msg.template?.name || "Template não encontrado"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      Dia {msg.day_offset}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {msg.send_time.slice(0, 5)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))
                        )}
                        
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => openAddMessageDialog(sequence.id)}
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar Mensagem
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Edit Sequence Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Sequência</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da sequência</Label>
                <Input
                  value={newSequenceName}
                  onChange={(e) => setNewSequenceName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={newSequenceDescription}
                  onChange={(e) => setNewSequenceDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateSequence}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Message Dialog */}
        <Dialog open={showAddMessageDialog} onOpenChange={setShowAddMessageDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Mensagem</DialogTitle>
              <DialogDescription>
                Configure quando esta mensagem será enviada na sequência
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={newMessageTemplateId} onValueChange={setNewMessageTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template aprovado" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum template aprovado disponível
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dia após entrada</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newMessageDayOffset}
                    onChange={(e) => setNewMessageDayOffset(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantos dias após entrar no follow-up
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Horário de envio</Label>
                  <Input
                    type="time"
                    value={newMessageSendTime}
                    onChange={(e) => setNewMessageSendTime(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Horário para envio da mensagem
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddMessageDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddMessage} disabled={!newMessageTemplateId}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default FollowUp;
