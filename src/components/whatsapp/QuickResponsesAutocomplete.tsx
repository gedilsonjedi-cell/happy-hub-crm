import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Zap, 
  Plus, 
  Search, 
  Loader2,
  MessageSquare,
  Save,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { cn } from "@/lib/utils";

interface QuickResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
}

interface QuickResponsesAutocompleteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResponse: (content: string) => void;
  searchTerm: string;
  anchorRef?: React.RefObject<HTMLElement>;
}

const categories = [
  { value: "geral", label: "Geral" },
  { value: "saudacao", label: "Saudação" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
  { value: "despedida", label: "Despedida" },
];

export const QuickResponsesAutocomplete = ({ 
  isOpen, 
  onClose, 
  onSelectResponse,
  searchTerm,
}: QuickResponsesAutocompleteProps) => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [responses, setResponses] = useState<QuickResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    shortcut: "",
    category: "geral"
  });
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch quick responses
  const fetchResponses = useCallback(async () => {
    if (!user || !effectiveOrganizationId) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("quick_responses")
      .select("*")
      .or(`organization_id.eq.${effectiveOrganizationId},and(organization_id.is.null,user_id.eq.${user.id})`)
      .order("title");

    if (!error && data) {
      setResponses(data);
    }
    setLoading(false);
  }, [user, effectiveOrganizationId]);

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      fetchResponses();
    }
  }, [user, effectiveOrganizationId, fetchResponses]);

  // Filter responses based on search term (remove the leading "/")
  const normalizedSearch = searchTerm.startsWith("/") 
    ? searchTerm.slice(1).toLowerCase() 
    : searchTerm.toLowerCase();

  const filteredResponses = responses.filter(r => {
    if (!normalizedSearch) return true;
    return (
      r.title.toLowerCase().includes(normalizedSearch) ||
      r.content.toLowerCase().includes(normalizedSearch) ||
      (r.shortcut && r.shortcut.toLowerCase().includes(normalizedSearch))
    );
  });

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResponses.length, searchTerm]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredResponses.length ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex === filteredResponses.length) {
          // "Add new" option selected
          setShowAddDialog(true);
        } else if (filteredResponses[selectedIndex]) {
          onSelectResponse(filteredResponses[selectedIndex].content);
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredResponses, onSelectResponse, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Save new quick response
  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("quick_responses")
      .insert({
        user_id: user?.id,
        organization_id: effectiveOrganizationId,
        title: formData.title,
        content: formData.content,
        shortcut: formData.shortcut || null,
        category: formData.category
      });

    if (error) {
      toast.error("Erro ao criar resposta");
      setSaving(false);
      return;
    }

    toast.success("Resposta criada!");
    setFormData({ title: "", content: "", shortcut: "", category: "geral" });
    setShowAddDialog(false);
    setSaving(false);
    fetchResponses();
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
      >
        <div className="p-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span>Respostas Rápidas</span>
            <span className="text-muted-foreground/60">• ↑↓ navegar • Enter selecionar • Esc fechar</span>
          </div>
        </div>

        <ScrollArea className="max-h-64">
          <div ref={listRef} className="p-1">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                <span className="text-xs">Carregando...</span>
              </div>
            ) : filteredResponses.length === 0 && !normalizedSearch ? (
              <div className="p-4 text-center text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Nenhuma resposta cadastrada</p>
              </div>
            ) : (
              <>
                {filteredResponses.map((response, index) => (
                  <div
                    key={response.id}
                    data-index={index}
                    className={cn(
                      "p-2 rounded-md cursor-pointer transition-colors",
                      selectedIndex === index 
                        ? "bg-primary/10 border border-primary/30" 
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      onSelectResponse(response.content);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-medium text-sm text-foreground truncate">
                        {response.title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {response.shortcut && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            /{response.shortcut}
                          </Badge>
                        )}
                        {response.category && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {categories.find(c => c.value === response.category)?.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {response.content}
                    </p>
                  </div>
                ))}

                {/* Add new option - always visible */}
                <div
                  data-index={filteredResponses.length}
                  className={cn(
                    "p-2 rounded-md cursor-pointer transition-colors flex items-center gap-2 mt-1 border-t border-border pt-2",
                    selectedIndex === filteredResponses.length 
                      ? "bg-primary/10 border border-primary/30" 
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => setShowAddDialog(true)}
                  onMouseEnter={() => setSelectedIndex(filteredResponses.length)}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-primary">
                    Adicionar nova resposta rápida
                  </span>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Resposta Rápida</DialogTitle>
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
                <p className="text-xs text-muted-foreground mt-1">
                  Digite /{formData.shortcut || "atalho"} para usar
                </p>
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
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
