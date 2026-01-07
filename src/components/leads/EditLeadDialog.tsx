import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  custom_fields: Record<string, string> | null;
}

interface EditLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSuccess?: () => void;
}

interface CustomFieldDefinition {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  is_required: boolean | null;
}

const statusOptions = [
  { value: "new", label: "Novo" },
  { value: "contacted", label: "Contatado" },
  { value: "qualified", label: "Qualificado" },
  { value: "converted", label: "Convertido" },
  { value: "lost", label: "Perdido" },
];

const estados = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", 
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", 
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function EditLeadDialog({ open, onOpenChange, lead, onSuccess }: EditLeadDialogProps) {
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Fetch custom field definitions
  const { data: customFields = [] } = useQuery({
    queryKey: ["custom-field-definitions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CustomFieldDefinition[];
    },
    enabled: !!organizationId,
  });

  // Populate form when lead changes
  useEffect(() => {
    if (lead && open) {
      setName(lead.name);
      setPhone(formatPhone(lead.phone));
      setEmail(lead.email || "");
      setDocument(lead.document || "");
      setCity(lead.city || "");
      setState(lead.state || "");
      setStatus(lead.status || "new");
      setNotes(lead.notes || "");
      setCustomFieldValues(lead.custom_fields || {});
    }
  }, [lead, open]);

  const formatPhone = (value: string) => {
    let digits = value.replace(/\D/g, "");
    
    // Remove DDI 55 if present for formatting purposes
    const hasDDI = digits.startsWith("55") && digits.length > 11;
    if (hasDDI) {
      digits = digits.slice(2);
    }
    
    // Limit to 11 digits (DDD + 9 digits mobile)
    if (digits.length > 11) {
      digits = digits.slice(0, 11);
    }
    
    // Format: (XX) XXXXX-XXXX for mobile (11 digits) or (XX) XXXX-XXXX for landline (10 digits)
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!lead) return;

    if (!name.trim() || !phone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanPhone = phone.replace(/\D/g, "");

      const { error } = await supabase
        .from("leads")
        .update({
          name: name.trim(),
          phone: cleanPhone,
          email: email.trim() || null,
          document: document.trim() || null,
          city: city.trim() || null,
          state: state || null,
          status,
          notes: notes.trim() || null,
          custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Contato atualizado com sucesso");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar contato:", error);
      toast.error("Erro ao atualizar contato");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomFieldChange = (fieldName: string, value: string) => {
    setCustomFieldValues(prev => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const renderCustomField = (field: CustomFieldDefinition) => {
    const value = customFieldValues[field.field_name] || "";

    switch (field.field_type) {
      case "textarea":
        return (
          <Textarea
            id={field.field_name}
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            placeholder={field.field_label}
            rows={2}
          />
        );
      case "select":
        return (
          <Select
            value={value}
            onValueChange={(v) => handleCustomFieldChange(field.field_name, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Selecione ${field.field_label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.field_options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "boolean":
        return (
          <Select
            value={value}
            onValueChange={(v) => handleCustomFieldChange(field.field_name, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        );
      case "number":
        return (
          <Input
            id={field.field_name}
            type="number"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            placeholder={field.field_label}
          />
        );
      case "date":
        return (
          <Input
            id={field.field_name}
            type="date"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
          />
        );
      default:
        return (
          <Input
            id={field.field_name}
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            placeholder={field.field_label}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
          <DialogDescription>
            Atualize as informações do contato
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone *</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                  +55
                </span>
                <Input
                  id="phone"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="(11) 99999-9999"
                  className="rounded-l-none"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="document">CPF/CNPJ</Label>
              <Input
                id="document"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {estados.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Nome da cidade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre o contato..."
              rows={2}
            />
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Campos Personalizados
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {customFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.field_name}>
                      {field.field_label}
                      {field.is_required && " *"}
                    </Label>
                    {renderCustomField(field)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
