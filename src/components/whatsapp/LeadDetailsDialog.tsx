import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User,
  Phone,
  Mail,
  FileText,
  MapPin,
  Loader2,
  Save,
  Tag,
} from "lucide-react";

interface LeadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  name: string | null;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
}

interface CustomFieldDefinition {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  is_required: boolean | null;
}

interface LeadTag {
  id: string;
  name: string;
  color: string | null;
}

export function LeadDetailsDialog({
  open,
  onOpenChange,
  phone,
  name,
}: LeadDetailsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    document: "",
    city: "",
    state: "",
    status: "new",
    notes: "",
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Normalize phone for query
  const normalizedPhone = phone.replace(/\D/g, "");

  // Fetch lead by phone
  const { data: lead, isLoading: loadingLead, refetch: refetchLead } = useQuery({
    queryKey: ["lead-by-phone", normalizedPhone],
    queryFn: async () => {
      // Try to find lead matching this phone
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .or(`phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone},phone.ilike.%${normalizedPhone}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Lead | null;
    },
    enabled: open && !!normalizedPhone,
  });

  // Fetch custom field definitions
  const { data: customFields } = useQuery({
    queryKey: ["custom-field-definitions"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as CustomFieldDefinition[];
    },
    enabled: open && !!user,
  });

  // Fetch available tags
  const { data: availableTags } = useQuery({
    queryKey: ["lead-tags"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("name");

      if (error) throw error;
      return data as LeadTag[];
    },
    enabled: open && !!user,
  });

  // Populate form when lead data loads
  useEffect(() => {
    if (lead) {
      setFormData({
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        document: lead.document || "",
        city: lead.city || "",
        state: lead.state || "",
        status: lead.status || "new",
        notes: lead.notes || "",
      });
      setCustomFieldValues((lead.custom_fields as Record<string, unknown>) || {});
      setSelectedTags(lead.tags || []);
    } else if (open) {
      // New lead - pre-fill with conversation data
      setFormData({
        name: name || "",
        phone: phone,
        email: "",
        document: "",
        city: "",
        state: "",
        status: "new",
        notes: "",
      });
      setCustomFieldValues({});
      setSelectedTags([]);
    }
  }, [lead, open, name, phone]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.organization_id) {
        toast.error("Organização não encontrada");
        return;
      }

      const leadData = {
        name: formData.name,
        phone: formData.phone.replace(/\D/g, ""),
        email: formData.email || null,
        document: formData.document || null,
        city: formData.city || null,
        state: formData.state || null,
        status: formData.status,
        notes: formData.notes || null,
        tags: selectedTags,
        custom_fields: customFieldValues as unknown as Record<string, string | number | boolean | null>,
        organization_id: profile.organization_id,
        user_id: user.id,
      };

      if (lead) {
        // Update existing lead
        const { error } = await supabase
          .from("leads")
          .update(leadData)
          .eq("id", lead.id);

        if (error) throw error;
        toast.success("Lead atualizado com sucesso!");
      } else {
        // Create new lead
        const { error } = await supabase.from("leads").insert(leadData);

        if (error) throw error;
        toast.success("Lead criado com sucesso!");
      }

      await refetchLead();
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (error: unknown) {
      console.error("Error saving lead:", error);
      toast.error("Erro ao salvar lead");
    } finally {
      setSaving(false);
    }
  };

  const handleCustomFieldChange = (fieldName: string, value: unknown) => {
    setCustomFieldValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  const renderCustomField = (field: CustomFieldDefinition) => {
    const value = customFieldValues[field.field_name];

    switch (field.field_type) {
      case "textarea":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="min-h-[80px]"
          />
        );
      case "select":
        return (
          <Select
            value={(value as string) || ""}
            onValueChange={(v) => handleCustomFieldChange(field.field_name, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {field.field_options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) =>
                handleCustomFieldChange(field.field_name, checked)
              }
            />
            <span className="text-sm text-muted-foreground">
              {value ? "Sim" : "Não"}
            </span>
          </div>
        );
      case "number":
        return (
          <Input
            type="number"
            value={(value as number) || ""}
            onChange={(e) =>
              handleCustomFieldChange(field.field_name, parseFloat(e.target.value) || 0)
            }
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
          />
        );
      default:
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="bg-emerald-500/10 text-emerald-500 text-lg font-semibold">
                {formData.name
                  ? formData.name.split(" ").map((n) => n[0]).join("")
                  : <User className="w-6 h-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg">
                {lead ? "Detalhes do Contato" : "Novo Contato"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3" />
                {phone}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loadingLead ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <User className="w-3 h-3" />
                    Nome
                  </Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do contato"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <Phone className="w-3 h-3" />
                    Telefone
                  </Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+55..."
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <Mail className="w-3 h-3" />
                    E-mail
                  </Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3 h-3" />
                    CPF/CNPJ
                  </Label>
                  <Input
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-3 h-3" />
                    Cidade
                  </Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Cidade"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Estado
                  </Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Novo</SelectItem>
                    <SelectItem value="contacted">Contatado</SelectItem>
                    <SelectItem value="qualified">Qualificado</SelectItem>
                    <SelectItem value="converted">Convertido</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              {availableTags && availableTags.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Tag className="w-3 h-3" />
                    Tags
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTags.includes(tag.name) ? "default" : "outline"}
                        className="cursor-pointer transition-all hover:scale-105"
                        style={{
                          backgroundColor: selectedTags.includes(tag.name)
                            ? tag.color || undefined
                            : undefined,
                          borderColor: tag.color || undefined,
                        }}
                        onClick={() => toggleTag(tag.name)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Observações
                </Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Anotações sobre o contato..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Custom Fields */}
              {customFields && customFields.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <Label className="text-xs text-muted-foreground font-medium">
                    Campos Personalizados
                  </Label>
                  {customFields.map((field) => (
                    <div key={field.id}>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        {field.field_label}
                        {field.is_required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {renderCustomField(field)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={saving || !formData.name} className="w-full gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {lead ? "Salvar Alterações" : "Criar Contato"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
