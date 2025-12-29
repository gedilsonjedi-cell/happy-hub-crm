import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { User, Phone, Mail, Calendar, Tag, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  stage_id: string | null;
  tags: string[] | null;
  created_at: string;
  notes?: string | null;
  city?: string | null;
  state?: string | null;
  document?: string | null;
}

interface LeadDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onUpdated: () => void;
}

export const LeadDetailsDialog = ({ isOpen, onClose, lead, onUpdated }: LeadDetailsDialogProps) => {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [fullLead, setFullLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (isOpen && lead) {
      fetchFullLead();
    }
  }, [isOpen, lead?.id]);

  const fetchFullLead = async () => {
    if (!lead) return;
    
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead.id)
      .single();

    if (!error && data) {
      setFullLead(data);
      setNotes(data.notes || "");
    }
  };

  const handleSaveNotes = async () => {
    if (!lead) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ notes })
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Anotações salvas");
      onUpdated();
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Erro ao salvar anotações");
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return null;

  const displayLead = fullLead || lead;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <User className="w-5 h-5" />
            {displayLead.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Contact Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{displayLead.phone}</span>
            </div>
            {displayLead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{displayLead.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>Criado em {format(new Date(displayLead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
            </div>
          </div>

          {/* Location */}
          {(displayLead.city || displayLead.state) && (
            <>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Localização: </span>
                <span>{[displayLead.city, displayLead.state].filter(Boolean).join(", ")}</span>
              </div>
            </>
          )}

          {/* Document */}
          {displayLead.document && (
            <div className="text-sm">
              <span className="text-muted-foreground">Documento: </span>
              <span>{displayLead.document}</span>
            </div>
          )}

          {/* Tags */}
          {displayLead.tags && displayLead.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="w-4 h-4" />
                  Tags
                </Label>
                <div className="flex flex-wrap gap-1">
                  {displayLead.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <FileText className="w-4 h-4" />
              Anotações
            </Label>
            <Textarea
              placeholder="Adicione observações sobre este lead..."
              className="bg-background border-border min-h-[100px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button 
              onClick={handleSaveNotes}
              disabled={saving}
              size="sm"
              className="w-full"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Anotações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
