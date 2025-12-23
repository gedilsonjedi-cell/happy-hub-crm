import { useState, useEffect } from "react";
import { 
  Zap, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Save, 
  X,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface QuickResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
}

interface QuickResponsesPanelProps {
  onSelectResponse: (content: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const categories = [
  { value: "geral", label: "Geral" },
  { value: "saudacao", label: "Saudação" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
  { value: "despedida", label: "Despedida" },
];

export const QuickResponsesPanel = ({ 
  onSelectResponse, 
  isOpen, 
  onClose 
}: QuickResponsesPanelProps) => {
  const { user } = useAuth();
  const [responses, setResponses] = useState<QuickResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingResponse, setEditingResponse] = useState<QuickResponse | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    shortcut: "",
    category: "geral"
  });

  useEffect(() => {
    if (user) {
      fetchResponses();
    }
  }, [user]);

  const fetchResponses = async () => {
    const { data, error } = await supabase
      .from("quick_responses")
      .select("*")
      .order("title");

    if (!error && data) {
      setResponses(data);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }

    if (editingResponse) {
      const { error } = await supabase
        .from("quick_responses")
        .update({
          title: formData.title,
          content: formData.content,
          shortcut: formData.shortcut || null,
          category: formData.category
        })
        .eq("id", editingResponse.id);

      if (error) {
        toast.error("Erro ao atualizar resposta");
        return;
      }
      toast.success("Resposta atualizada!");
    } else {
      const { error } = await supabase
        .from("quick_responses")
        .insert({
          user_id: user?.id,
          title: formData.title,
          content: formData.content,
          shortcut: formData.shortcut || null,
          category: formData.category
        });

      if (error) {
        toast.error("Erro ao criar resposta");
        return;
      }
      toast.success("Resposta criada!");
    }

    setFormData({ title: "", content: "", shortcut: "", category: "geral" });
    setEditingResponse(null);
    setShowAddDialog(false);
    fetchResponses();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("quick_responses")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao deletar resposta");
      return;
    }
    toast.success("Resposta removida!");
    fetchResponses();
  };

  const handleEdit = (response: QuickResponse) => {
    setEditingResponse(response);
    setFormData({
      title: response.title,
      content: response.content,
      shortcut: response.shortcut || "",
      category: response.category || "geral"
    });
    setShowAddDialog(true);
  };

  const filteredResponses = responses.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.shortcut && r.shortcut.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || r.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full animate-slide-in-right">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Respostas Rápidas</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-10 bg-muted/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          <Badge
            variant={selectedCategory === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedCategory("all")}
          >
            Todos
          </Badge>
          {categories.map(cat => (
            <Badge
              key={cat.value}
              variant={selectedCategory === cat.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">Carregando...</div>
        ) : filteredResponses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma resposta encontrada</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {filteredResponses.map(response => (
              <div
                key={response.id}
                className="group p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => {
                  onSelectResponse(response.content);
                  onClose();
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-foreground">{response.title}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(response);
                      }}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(response.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{response.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  {response.shortcut && (
                    <Badge variant="secondary" className="text-xs">/{response.shortcut}</Badge>
                  )}
                  {response.category && (
                    <Badge variant="outline" className="text-xs">
                      {categories.find(c => c.value === response.category)?.label}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button 
              className="w-full gap-2" 
              onClick={() => {
                setEditingResponse(null);
                setFormData({ title: "", content: "", shortcut: "", category: "geral" });
              }}
            >
              <Plus className="w-4 h-4" />
              Nova Resposta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingResponse ? "Editar Resposta" : "Nova Resposta Rápida"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Título</label>
                <Input
                  placeholder="Ex: Saudação inicial"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Conteúdo</label>
                <Textarea
                  placeholder="Escreva o conteúdo da resposta..."
                  className="min-h-[120px]"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Atalho</label>
                  <Input
                    placeholder="Ex: ola"
                    value={formData.shortcut}
                    onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Digite /{formData.shortcut || "atalho"} para usar</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Categoria</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} className="gap-2">
                  <Save className="w-4 h-4" />
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
