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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, MessageSquare, Calendar, Clock } from "lucide-react";

interface FollowUpSequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  message_count?: number;
}

interface FollowUpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  leadName: string;
  leadPhone: string;
  channelId: string | null;
}

export const FollowUpDialog = ({
  isOpen,
  onClose,
  leadId,
  leadName,
  leadPhone,
  channelId,
}: FollowUpDialogProps) => {
  const { user } = useAuth();
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingInstance, setExistingInstance] = useState<{ id: string; sequence_name: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSequences();
      checkExistingInstance();
    }
  }, [isOpen, leadId]);

  const fetchSequences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("follow_up_sequences")
        .select("id, name, description, is_active")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      // Get message count for each sequence
      const sequencesWithCount = await Promise.all(
        (data || []).map(async (seq) => {
          const { count } = await supabase
            .from("follow_up_messages")
            .select("*", { count: "exact", head: true })
            .eq("sequence_id", seq.id);

          return { ...seq, message_count: count || 0 };
        })
      );

      setSequences(sequencesWithCount);
    } catch (error) {
      console.error("Error fetching sequences:", error);
      toast.error("Erro ao carregar sequências");
    } finally {
      setLoading(false);
    }
  };

  const checkExistingInstance = async () => {
    if (!leadId) return;

    try {
      const { data } = await supabase
        .from("follow_up_instances")
        .select("id, sequence_id")
        .eq("lead_id", leadId)
        .eq("status", "active")
        .single();

      if (data) {
        const { data: seqData } = await supabase
          .from("follow_up_sequences")
          .select("name")
          .eq("id", data.sequence_id)
          .single();

        setExistingInstance({
          id: data.id,
          sequence_name: seqData?.name || "Desconhecido"
        });
      } else {
        setExistingInstance(null);
      }
    } catch {
      setExistingInstance(null);
    }
  };

  const handleStartFollowUp = async () => {
    if (!selectedSequenceId) {
      toast.error("Selecione uma sequência");
      return;
    }

    if (!leadId) {
      toast.error("Lead não encontrado");
      return;
    }

    setSubmitting(true);
    try {
      // Get organization_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      // Create follow-up instance
      const { error } = await supabase
        .from("follow_up_instances")
        .insert({
          lead_id: leadId,
          sequence_id: selectedSequenceId,
          channel_id: channelId,
          organization_id: profile?.organization_id,
          started_by: user?.id,
          status: "active",
          next_message_index: 0
        });

      if (error) throw error;

      const selectedSeq = sequences.find(s => s.id === selectedSequenceId);
      toast.success(`Follow-up "${selectedSeq?.name}" iniciado para ${leadName || leadPhone}`);
      onClose();
    } catch (error) {
      console.error("Error starting follow-up:", error);
      toast.error("Erro ao iniciar follow-up");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelFollowUp = async () => {
    if (!existingInstance) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("follow_up_instances")
        .update({ status: "cancelled" })
        .eq("id", existingInstance.id);

      if (error) throw error;

      toast.success("Follow-up cancelado");
      setExistingInstance(null);
    } catch (error) {
      console.error("Error cancelling follow-up:", error);
      toast.error("Erro ao cancelar follow-up");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSequence = sequences.find(s => s.id === selectedSequenceId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Follow-up Automático</DialogTitle>
          <DialogDescription>
            {existingInstance
              ? `Este contato já está em follow-up: "${existingInstance.sequence_name}"`
              : `Adicione ${leadName || leadPhone} a uma sequência de follow-up`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : existingInstance ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <p className="text-sm text-warning">
                Este contato já está recebendo mensagens automáticas da sequência "{existingInstance.sequence_name}".
              </p>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleCancelFollowUp}
              disabled={submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancelar Follow-up Atual
            </Button>
          </div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhuma sequência de follow-up configurada.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Configure sequências em CRM → Follow-up
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sequência de Follow-up</Label>
              <Select value={selectedSequenceId} onValueChange={setSelectedSequenceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma sequência" />
                </SelectTrigger>
                <SelectContent>
                  {sequences.map((seq) => (
                    <SelectItem key={seq.id} value={seq.id}>
                      <div className="flex items-center gap-2">
                        <span>{seq.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {seq.message_count} msgs
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSequence && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium">{selectedSequence.name}</p>
                {selectedSequence.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedSequence.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3" />
                  <span>{selectedSequence.message_count} mensagens programadas</span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {!existingInstance && sequences.length > 0 && (
            <Button
              onClick={handleStartFollowUp}
              disabled={!selectedSequenceId || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Iniciar Follow-up
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
