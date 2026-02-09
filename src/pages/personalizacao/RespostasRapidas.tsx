import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Zap,
  Loader2,
  MessageSquare,
  GripVertical
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface QuickResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  display_order: number;
}

const categories = ["Saudação", "Informação", "Vendas", "Suporte", "Encerramento", "Outros"];

// Sortable Card Component
function SortableCard({ 
  response, 
  onEdit, 
  onDelete 
}: { 
  response: QuickResponse; 
  onEdit: (response: QuickResponse) => void;
  onDelete: (response: QuickResponse) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: response.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "hover:border-primary/50 transition-colors",
        isDragging && "opacity-50 shadow-lg z-50"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <button
              {...attributes}
              {...listeners}
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{response.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {response.shortcut && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    /{response.shortcut}
                  </Badge>
                )}
                {response.category && (
                  <Badge variant="outline" className="text-xs">
                    {response.category}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(response)}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(response)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {response.content}
        </p>
      </CardContent>
    </Card>
  );
}

export default function RespostasRapidas() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [responses, setResponses] = useState<QuickResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingResponse, setEditingResponse] = useState<QuickResponse | null>(null);
  const [deletingResponse, setDeletingResponse] = useState<QuickResponse | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    shortcut: "",
    category: ""
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchResponses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quick_responses")
      .select("id, title, content, shortcut, category, display_order")
      .or(effectiveOrganizationId 
        ? `organization_id.eq.${effectiveOrganizationId},and(organization_id.is.null,user_id.eq.${user?.id})`
        : `user_id.eq.${user?.id}`)
      .order("display_order", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar respostas rápidas");
      console.error(error);
    } else {
      setResponses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchResponses();
    }
  }, [user]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = responses.findIndex((r) => r.id === active.id);
      const newIndex = responses.findIndex((r) => r.id === over.id);

      const newOrder = arrayMove(responses, oldIndex, newIndex);
      setResponses(newOrder);

      // Update display_order in database
      const updates = newOrder.map((response, index) => ({
        id: response.id,
        display_order: index + 1,
      }));

      try {
        for (const update of updates) {
          await supabase
            .from("quick_responses")
            .update({ display_order: update.display_order })
            .eq("id", update.id);
        }
        toast.success("Ordem atualizada!");
      } catch (error) {
        console.error("Error updating order:", error);
        toast.error("Erro ao atualizar ordem");
        fetchResponses(); // Revert on error
      }
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }

    setSaving(true);

    try {
      if (editingResponse) {
        const { error } = await supabase
          .from("quick_responses")
          .update({
            title: formData.title.trim(),
            content: formData.content.trim(),
            shortcut: formData.shortcut.trim() || null,
            category: formData.category || null,
          })
          .eq("id", editingResponse.id);

        if (error) throw error;
        toast.success("Resposta atualizada!");
      } else {
        // Get max display_order for new items
        const maxOrder = responses.length > 0 
          ? Math.max(...responses.map(r => r.display_order || 0)) 
          : 0;

        const { error } = await supabase
          .from("quick_responses")
          .insert({
            title: formData.title.trim(),
            content: formData.content.trim(),
            shortcut: formData.shortcut.trim() || null,
            category: formData.category || null,
            user_id: user?.id,
            organization_id: effectiveOrganizationId,
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        toast.success("Resposta criada!");
      }

      setShowDialog(false);
      resetForm();
      fetchResponses();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar resposta");
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingResponse) return;

    try {
      const { error } = await supabase
        .from("quick_responses")
        .delete()
        .eq("id", deletingResponse.id);

      if (error) throw error;
      toast.success("Resposta excluída!");
      setShowDeleteDialog(false);
      setDeletingResponse(null);
      fetchResponses();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir resposta");
    }
  };

  const handleEdit = (response: QuickResponse) => {
    setEditingResponse(response);
    setFormData({
      title: response.title,
      content: response.content,
      shortcut: response.shortcut || "",
      category: response.category || ""
    });
    setShowDialog(true);
  };

  const handleNew = () => {
    resetForm();
    setEditingResponse(null);
    setShowDialog(true);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      shortcut: "",
      category: ""
    });
    setEditingResponse(null);
  };

  const filteredResponses = responses.filter((response) => {
    const matchesSearch = 
      response.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (response.shortcut?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = !selectedCategory || response.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Check if we can use drag-and-drop (no filters active)
  const canReorder = !searchTerm && !selectedCategory;

  return (
    <MainLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              Respostas Rápidas
            </h1>
            <p className="text-muted-foreground mt-1">
              Crie mensagens pré-definidas para agilizar seus atendimentos
            </p>
          </div>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Resposta
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar respostas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={selectedCategory === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(null)}
                >
                  Todas
                </Badge>
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
            {canReorder && responses.length > 1 && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <GripVertical className="w-3 h-3" />
                Arraste os cards para reorganizar a ordem
              </p>
            )}
          </CardContent>
        </Card>

        {/* Responses List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredResponses.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Nenhuma resposta encontrada</p>
                <p className="text-sm mt-1">
                  {responses.length === 0 
                    ? "Crie sua primeira resposta rápida para começar" 
                    : "Tente ajustar os filtros de busca"}
                </p>
                {responses.length === 0 && (
                  <Button onClick={handleNew} className="mt-4 gap-2">
                    <Plus className="w-4 h-4" />
                    Criar Primeira Resposta
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : canReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredResponses.map(r => r.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredResponses.map((response) => (
                  <SortableCard
                    key={response.id}
                    response={response}
                    onEdit={handleEdit}
                    onDelete={(r) => {
                      setDeletingResponse(r);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResponses.map((response) => (
              <Card key={response.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{response.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        {response.shortcut && (
                          <Badge variant="secondary" className="text-xs font-mono">
                            /{response.shortcut}
                          </Badge>
                        )}
                        {response.category && (
                          <Badge variant="outline" className="text-xs">
                            {response.category}
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(response)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeletingResponse(response);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {response.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingResponse ? "Editar Resposta Rápida" : "Nova Resposta Rápida"}
              </DialogTitle>
              <DialogDescription>
                Crie uma mensagem pré-definida para usar em seus atendimentos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título *</label>
                <Input
                  placeholder="Ex: Saudação inicial"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Conteúdo *</label>
                <Textarea
                  placeholder="Digite o texto da resposta..."
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Atalho</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                    <Input
                      placeholder="ola"
                      value={formData.shortcut}
                      onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() }))}
                      className="pl-7"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Digite /{formData.shortcut || "atalho"} no chat
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  editingResponse ? "Salvar Alterações" : "Criar Resposta"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir "{deletingResponse?.title}"? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
