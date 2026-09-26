import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useLeadActivityLog } from "@/hooks/useLeadActivityLog";
import { toast } from "sonner";
import { normalizePhoneForStorage } from "@/lib/brazilPhoneValidation";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Megaphone,
  Calendar,
  Building2,
  Clock,
  Edit,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadActivityTimeline } from "@/components/leads/LeadActivityTimeline";

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

interface CampaignDispatch {
  id: string;
  campaign_name: string;
  sector_name: string | null;
  sent_at: string | null;
  created_at: string;
  status: string;
}

export function LeadDetailsDialog({
  open,
  onOpenChange,
  phone,
  name,
}: LeadDetailsDialogProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

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

  // Normalize phone for query - use multiple suffix lengths for better matching
  const normalizedPhone = phone.replace(/\D/g, "");
  const phoneEnd9 = normalizedPhone.slice(-9);
  const phoneEnd8 = normalizedPhone.slice(-8);
  const phoneEnd7 = normalizedPhone.slice(-7);

  // Reset form state when dialog opens with new phone
  useEffect(() => {
    if (open) {
      // Reset to defaults when opening
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
  }, [open, phone, name]);

  // Fetch lead by phone - prioritize leads with tags and real names
  // CRITICAL: Include effectiveOrganizationId in queryKey to prevent cross-organization cache pollution
  const { data: lead, isLoading: loadingLead, refetch: refetchLead } = useQuery({
    queryKey: ["lead-by-phone", normalizedPhone, effectiveOrganizationId, open],
    queryFn: async () => {
      if (!open || !effectiveOrganizationId) return null;

      console.log('[LeadDetailsDialog] Searching lead with phone:', normalizedPhone, 'org:', effectiveOrganizationId);

      // Try multiple suffix lengths to handle different phone formats
      // First try with 9 digits, then 8, then 7 for better matching
      let allMatches: Lead[] | null = null;
      
      for (const suffix of [phoneEnd9, phoneEnd8, phoneEnd7]) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("organization_id", effectiveOrganizationId)
          .ilike("phone", `%${suffix}`);
        
        if (error) {
          console.error('[LeadDetailsDialog] Query error:', error);
          throw error;
        }
        
        if (data && data.length > 0) {
          allMatches = data as Lead[];
          console.log('[LeadDetailsDialog] Found matches with suffix', suffix, ':', allMatches.length);
          break;
        }
      }

      if (!allMatches || allMatches.length === 0) {
        console.log('[LeadDetailsDialog] No matches found with any suffix');
        return null;
      }
      
      // If only one match, return it
      if (allMatches.length === 1) return allMatches[0] as Lead;
      
      // Prioritize: leads with tags > leads with real names > leads with more data
      const scored = allMatches.map(lead => {
        let score = 0;
        const isAutoGenerated = lead.name?.startsWith('LeadWhats-') || lead.name?.startsWith('WhatsApp ');
        
        // Has tags = highest priority
        if (lead.tags && lead.tags.length > 0) score += 100;
        // Has real name (not auto-generated)
        if (lead.name && !isAutoGenerated) score += 50;
        // Has additional data
        if (lead.email) score += 5;
        if (lead.city) score += 5;
        if (lead.document) score += 5;
        if (lead.notes) score += 5;
        // Older leads might have more history
        score += 1;
        
        return { lead, score };
      });
      
      // Sort by score descending and return best match
      scored.sort((a, b) => b.score - a.score);
      console.log('[LeadDetailsDialog] Best match:', scored[0]?.lead);
      return scored[0].lead as Lead;
    },
    enabled: open && !!normalizedPhone && !!effectiveOrganizationId,
    staleTime: 0, // Always refetch when dialog opens
    gcTime: 0, // Don't cache
  });

  // Fetch custom field definitions - use effectiveOrganizationId
  const { data: customFields } = useQuery({
    queryKey: ["custom-field-definitions", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("*")
        .eq("organization_id", effectiveOrganizationId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as CustomFieldDefinition[];
    },
    enabled: open && !!effectiveOrganizationId,
  });

  // Fetch available tags - use effectiveOrganizationId to respect impersonation
  const { data: availableTags } = useQuery({
    queryKey: ["lead-tags", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      const { data, error } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", effectiveOrganizationId)
        .order("name");

      if (error) throw error;
      return data as LeadTag[];
    },
    enabled: open && !!effectiveOrganizationId,
    staleTime: 30000, // 30 seconds - refetch to ensure fresh data
  });

  // Fetch campaign dispatch history for this phone - use effectiveOrganizationId
  const { data: campaignHistory } = useQuery({
    queryKey: ["campaign-history", normalizedPhone, effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      // Build search patterns for phone matching (use last 8 digits for best matching)
      const phonePatterns = [
        normalizedPhone,
        `+${normalizedPhone}`,
      ];

      // Get recipients that match any of the phone patterns
      const { data: recipients, error } = await supabase
        .from("campaign_recipients")
        .select(`
          id,
          phone,
          sent_at,
          created_at,
          status,
          campaign_id,
          campaigns!inner(
            id,
            name,
            sector_id,
            organization_id,
            sectors(name)
          )
        `)
        .or(phonePatterns.map(p => `phone.ilike.%${p.slice(-8)}`).join(","))
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false });

      if (error) {
        console.error("Error fetching campaign history:", error);
        return [];
      }

      // Filter to only include campaigns from the effective organization
      const filtered = recipients?.filter(
        (r) => (r.campaigns as { organization_id: string })?.organization_id === effectiveOrganizationId
      ) || [];

      return filtered.map((r) => ({
        id: r.id,
        campaign_name: (r.campaigns as { name: string })?.name || "Campanha",
        sector_name: (r.campaigns as { sectors: { name: string } | null })?.sectors?.name || null,
        sent_at: r.sent_at,
        created_at: r.created_at,
        status: r.status,
      })) as CampaignDispatch[];
    },
    enabled: open && !!effectiveOrganizationId && !!normalizedPhone,
  });

  // Activity log
  const { activities, loading: loadingActivities } = useLeadActivityLog(lead?.id || null);

  // Populate form when lead data loads
  useEffect(() => {
    if (!open) return;
    
    if (lead) {
      console.log('[LeadDetailsDialog] Populating form with lead:', lead.id, lead.name, lead.tags);
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
    } else if (!loadingLead) {
      // No lead found and not loading - keep defaults set on open
      console.log('[LeadDetailsDialog] No lead found, using defaults');
    }
  }, [lead, open, loadingLead]);

  const handleSave = async () => {
    if (!user || !effectiveOrganizationId) {
      toast.error("Organização não encontrada");
      return;
    }

    setSaving(true);
    try {
      // Normaliza o telefone: SEMPRE adiciona 55 na frente
      const normalizedPhone = normalizePhoneForStorage(formData.phone);

      const leadData = {
        name: formData.name,
        phone: normalizedPhone,
        email: formData.email || null,
        document: formData.document || null,
        city: formData.city || null,
        state: formData.state || null,
        status: formData.status,
        notes: formData.notes || null,
        tags: selectedTags,
        custom_fields: customFieldValues as unknown as Record<string, string | number | boolean | null>,
        organization_id: effectiveOrganizationId,
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
      <DialogContent className="max-w-lg h-[90vh] flex flex-col bg-background">
        <DialogHeader className="pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="bg-success/10 text-success text-lg font-semibold">
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

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loadingLead ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Dados
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Histórico
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-0">
                <div className="space-y-4 py-2">
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

              {/* Campaign History */}
              {campaignHistory && campaignHistory.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Megaphone className="w-3 h-3" />
                    Histórico de Campanhas
                  </Label>
                  <div className="space-y-2">
                    {campaignHistory.map((dispatch) => (
                      <div 
                        key={dispatch.id} 
                        className="p-3 rounded-lg bg-muted/50 border border-border space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {dispatch.campaign_name}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={
                              dispatch.status === "delivered" 
                                ? "bg-success/10 text-success border-success/30 text-[0.625rem]" 
                                : dispatch.status === "failed" 
                                  ? "bg-destructive/10 text-destructive border-destructive/30 text-[0.625rem]"
                                  : "bg-info/10 text-info border-info/30 text-[0.625rem]"
                            }
                          >
                            {dispatch.status === "delivered" ? "Entregue" : dispatch.status === "failed" ? "Falhou" : dispatch.status === "sent" ? "Enviado" : dispatch.status}
                          </Badge>
                        </div>
                        {dispatch.sector_name && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Building2 className="w-3 h-3" />
                            <span>{dispatch.sector_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {dispatch.sent_at 
                              ? format(new Date(dispatch.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                              : format(new Date(dispatch.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                            }
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <LeadActivityTimeline activities={activities} loading={loadingActivities} maxHeight="calc(90vh - 280px)" />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="pt-4 border-t border-border flex-shrink-0">
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
