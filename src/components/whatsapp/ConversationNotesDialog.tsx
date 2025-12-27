import { useState, useEffect } from "react";
import { StickyNote, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ConversationNotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contactPhone: string;
  contactName?: string | null;
}

export const ConversationNotesDialog = ({ 
  isOpen, 
  onClose, 
  contactPhone,
  contactName 
}: ConversationNotesDialogProps) => {
  const [notes, setNotes] = useState("");
  const [originalNotes, setOriginalNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && contactPhone) {
      fetchNotes();
    }
  }, [isOpen, contactPhone]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const normalizedPhone = contactPhone.replace(/\D/g, '');
      
      const { data, error } = await supabase
        .from("leads")
        .select("notes")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (!error && data) {
        setNotes(data.notes || "");
        setOriginalNotes(data.notes || "");
      } else {
        setNotes("");
        setOriginalNotes("");
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedPhone = contactPhone.replace(/\D/g, '');
      
      const { error } = await supabase
        .from("leads")
        .update({ notes: notes.trim() || null })
        .eq("phone", normalizedPhone);

      if (error) throw error;

      setOriginalNotes(notes);
      toast.success("Nota salva com sucesso!");
      onClose();
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Erro ao salvar nota");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setNotes("");
  };

  const handleClose = () => {
    setNotes(originalNotes);
    onClose();
  };

  const hasChanges = notes !== originalNotes;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-warning" />
            Notas da Conversa
          </DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Notas sobre ${contactName}`
              : "Adicione observações sobre esta conversa"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Ex: Cliente interessado em produto X, retornar na próxima semana..."
                  className="min-h-[150px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Estas notas serão visíveis para todos os atendentes
                </p>
              </div>

              {notes && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleClear}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar nota
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
