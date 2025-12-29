import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface SaleConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactPhone: string;
  contactName: string | null;
  onConfirm: (saleCompleted: boolean) => void;
}

interface PipelineStage {
  id: string;
  name: string;
  order_index: number;
}

export function SaleConfirmationDialog({
  open,
  onOpenChange,
  contactPhone,
  contactName,
  onConfirm,
}: SaleConfirmationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<{ vendas: PipelineStage | null; naoFinalizou: PipelineStage | null }>({
    vendas: null,
    naoFinalizou: null,
  });

  useEffect(() => {
    const fetchStages = async () => {
      // Always fetch from the default pipeline for sale confirmation
      const DEFAULT_PIPELINE_ID = "00000000-0000-0000-0000-000000000001";
      
      const { data: stagesData, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, order_index")
        .eq("pipeline_id", DEFAULT_PIPELINE_ID)
        .order("order_index");

      console.log("Fetched stages for default pipeline:", stagesData, "error:", error);

      if (stagesData && stagesData.length > 0) {
        const vendasStage = stagesData.find(s => s.name.toLowerCase() === "vendas");
        const naoFinalizouStage = stagesData.find(s => s.name.toLowerCase() === "não finalizou venda");
        
        console.log("Found stages:", { vendasStage, naoFinalizouStage });
        
        setStages({
          vendas: vendasStage || null,
          naoFinalizou: naoFinalizouStage || null,
        });
      }
    };

    if (open) {
      fetchStages();
    }
  }, [open]);

  const handleConfirm = async (saleCompleted: boolean) => {
    setLoading(true);
    try {
      const targetStage = saleCompleted ? stages.vendas : stages.naoFinalizou;

      console.log("Target stage:", targetStage);
      console.log("All stages:", stages);

      if (!targetStage) {
        toast.error(`Estágio ${saleCompleted ? "Vendas" : "Não finalizou venda"} não encontrado`);
        onConfirm(saleCompleted);
        onOpenChange(false);
        setLoading(false);
        return;
      }

      // Find the lead by phone
      const normalizedPhone = contactPhone.replace(/\D/g, "");
      console.log("Looking for lead with phone:", normalizedPhone);
      
      // Search for lead with this phone
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, phone, stage_id, name");

      console.log("Found leads:", leads);

      if (leadsError) {
        console.error("Error fetching leads:", leadsError);
        toast.error("Erro ao buscar lead");
        onConfirm(saleCompleted);
        onOpenChange(false);
        setLoading(false);
        return;
      }

      // Find lead by normalized phone
      const matchingLeads = leads?.filter(l => l.phone.replace(/\D/g, "") === normalizedPhone) || [];
      console.log("Matching leads:", matchingLeads);

      if (matchingLeads.length > 0) {
        // Update all matching leads
        let updateSuccess = false;
        for (const lead of matchingLeads) {
          const { error: updateError } = await supabase
            .from("leads")
            .update({ stage_id: targetStage.id })
            .eq("id", lead.id);

          if (updateError) {
            console.error("Error updating lead:", lead.id, updateError);
          } else {
            console.log("Successfully updated lead:", lead.id, "to stage:", targetStage.id);
            updateSuccess = true;
          }
        }
        
        if (updateSuccess) {
          toast.success(`Lead movido para "${targetStage.name}"`);
        } else {
          toast.error("Erro ao atualizar estágio do lead");
        }
      } else {
        toast.info("Lead não encontrado - conversa arquivada sem atualização de pipeline");
      }

      onConfirm(saleCompleted);
      onOpenChange(false);
    } catch (error) {
      console.error("Error in sale confirmation:", error);
      toast.error("Erro ao processar confirmação");
      onConfirm(saleCompleted);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resultado do Atendimento</DialogTitle>
          <DialogDescription>
            {contactName || contactPhone} - Como foi o resultado deste atendimento?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-6">
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 border-2 hover:border-green-500 hover:bg-green-500/10"
            onClick={() => handleConfirm(true)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            )}
            <span className="font-medium">Venda Realizada</span>
          </Button>

          <Button
            variant="outline"
            className="h-24 flex-col gap-2 border-2 hover:border-red-500 hover:bg-red-500/10"
            onClick={() => handleConfirm(false)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <XCircle className="h-8 w-8 text-red-500" />
            )}
            <span className="font-medium">Não Finalizou</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
