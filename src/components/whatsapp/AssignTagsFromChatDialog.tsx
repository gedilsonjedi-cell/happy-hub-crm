import { useState, useEffect } from "react";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagSelector } from "@/components/leads/TagSelector";

interface AssignTagsFromChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactPhone: string;
  contactName?: string | null;
  onSuccess?: () => void;
}

export function AssignTagsFromChatDialog({
  open,
  onOpenChange,
  contactPhone,
  contactName,
  onSuccess,
}: AssignTagsFromChatDialogProps) {
  const { user } = useAuth();
  const { organizationId } = useUserRole();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrCreateLead = async () => {
      if (!open || !user || !organizationId || !contactPhone) return;

      setLoading(true);
      const normalizedPhone = contactPhone.replace(/\D/g, "");

      // Buscar lead existente
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, tags")
        .eq("organization_id", organizationId)
        .eq("phone", normalizedPhone)
        .single();

      if (existingLead) {
        setLeadId(existingLead.id);
        setSelectedTags(existingLead.tags || []);
      } else {
        // Lead não existe, será criado ao salvar
        setLeadId(null);
        setSelectedTags([]);
      }

      setLoading(false);
    };

    fetchOrCreateLead();
  }, [open, user, organizationId, contactPhone]);

  const handleSave = async () => {
    if (!user || !organizationId) {
      toast.error("Erro ao identificar organização");
      return;
    }

    setSaving(true);

    try {
      const normalizedPhone = contactPhone.replace(/\D/g, "");

      if (leadId) {
        // Atualizar lead existente
        const { error } = await supabase
          .from("leads")
          .update({ tags: selectedTags })
          .eq("id", leadId);

        if (error) throw error;
      } else {
        // Criar novo lead
        const { error } = await supabase
          .from("leads")
          .insert({
            organization_id: organizationId,
            user_id: user.id,
            name: contactName || "Contato WhatsApp",
            phone: normalizedPhone,
            tags: selectedTags.length > 0 ? selectedTags : null,
            status: "new",
          });

        if (error) throw error;
      }

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
            <p className="text-sm font-medium">{contactName || "Contato"}</p>
            <p className="text-xs text-muted-foreground">{contactPhone}</p>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <>
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

              {!leadId && (
                <p className="text-xs text-muted-foreground">
                  Este contato será adicionado à sua lista de leads.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
