import { useState } from "react";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagSelector } from "./TagSelector";

interface AssignTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  leadName?: string;
  leadPhone?: string;
  currentTags?: string[];
  onSuccess?: () => void;
}

export function AssignTagsDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  leadPhone,
  currentTags = [],
  onSuccess,
}: AssignTagsDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(currentTags);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!leadId) {
      toast.error("Lead não identificado");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("leads")
        .update({ tags: selectedTags })
        .eq("id", leadId);

      if (error) throw error;

      toast.success("Tags atualizadas com sucesso");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar tags:", error);
      toast.error("Erro ao atualizar tags");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Atribuir Tags
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{leadName || "Lead"}</p>
            <p className="text-xs text-muted-foreground">{leadPhone}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Selecione as tags:</label>
            <TagSelector
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
            />
          </div>

          {selectedTags.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Tags selecionadas:
              </label>
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
