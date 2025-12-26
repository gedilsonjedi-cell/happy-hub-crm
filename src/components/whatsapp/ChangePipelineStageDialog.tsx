import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Loader2, ArrowRight } from "lucide-react";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

interface ChangePipelineStageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  leadName: string;
  currentStageId: string | null;
  onStageChanged?: () => void;
}

export const ChangePipelineStageDialog = ({
  isOpen,
  onClose,
  leadId,
  leadName,
  currentStageId,
  onStageChanged,
}: ChangePipelineStageDialogProps) => {
  const { user } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchStages();
      setSelectedStageId(currentStageId || "");
    }
  }, [isOpen, currentStageId]);

  const fetchStages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, order_index")
        .order("order_index");

      if (error) throw error;

      setStages(data || []);
    } catch (error) {
      console.error("Error fetching stages:", error);
      toast.error("Erro ao carregar etapas");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStage = async () => {
    if (!selectedStageId) {
      toast.error("Selecione uma etapa");
      return;
    }

    if (!leadId) {
      toast.error("Lead não encontrado");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ stage_id: selectedStageId })
        .eq("id", leadId);

      if (error) throw error;

      const selectedStage = stages.find(s => s.id === selectedStageId);
      toast.success(`${leadName} movido para "${selectedStage?.name}"`);
      onStageChanged?.();
      onClose();
    } catch (error) {
      console.error("Error changing stage:", error);
      toast.error("Erro ao alterar etapa");
    } finally {
      setSubmitting(false);
    }
  };

  const currentStage = stages.find(s => s.id === currentStageId);
  const selectedStage = stages.find(s => s.id === selectedStageId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Etapa do Pipeline</DialogTitle>
          <DialogDescription>
            Mova {leadName} para uma nova etapa do funil de vendas
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : stages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa de pipeline configurada.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Configure etapas em CRM → Pipeline
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {currentStage && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Etapa atual:</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentStage.color }}
                  />
                  <span className="font-medium">{currentStage.name}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Nova etapa</Label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span>{stage.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentStage && selectedStage && currentStageId !== selectedStageId && (
              <div className="flex items-center justify-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentStage.color }}
                  />
                  <span className="text-sm">{currentStage.name}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedStage.color }}
                  />
                  <span className="text-sm font-medium">{selectedStage.name}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleChangeStage}
            disabled={!selectedStageId || selectedStageId === currentStageId || submitting}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Alterar Etapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
