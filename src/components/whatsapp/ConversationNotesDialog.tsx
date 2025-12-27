import { useState } from "react";
import { StickyNote, Loader2, Send } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";

interface ConversationNotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contactPhone: string;
  contactName?: string | null;
  channelId?: string | null;
  onNoteAdded?: () => void;
}

export const ConversationNotesDialog = ({ 
  isOpen, 
  onClose, 
  contactPhone,
  contactName,
  channelId,
  onNoteAdded
}: ConversationNotesDialogProps) => {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!note.trim() || !user) return;

    setSaving(true);
    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.organization_id) {
        toast.error("Organização não encontrada");
        return;
      }

      const normalizedPhone = contactPhone.replace(/\D/g, '');
      
      const { error } = await supabase
        .from("conversation_notes")
        .insert({
          organization_id: profile.organization_id,
          channel_id: channelId || null,
          contact_phone: normalizedPhone,
          content: note.trim(),
          created_by: user.id
        });

      if (error) throw error;

      toast.success("Nota adicionada!");
      setNote("");
      onNoteAdded?.();
      onClose();
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Erro ao salvar nota");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setNote("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-warning" />
            Adicionar Nota
          </DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Nota sobre ${contactName}`
              : "Adicione uma observação sobre esta conversa"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              placeholder="Ex: Cliente interessado em produto X, retornar na próxima semana..."
              className="min-h-[120px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A nota aparecerá no histórico da conversa
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!note.trim() || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Adicionar Nota
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
