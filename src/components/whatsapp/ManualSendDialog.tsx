import { useState, useEffect } from "react";
import { 
  Send, 
  Phone,
  FileText,
  Search,
  ChevronRight,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { splitTemplateParams, templateVariableLabel } from "@/lib/templateVariables";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignmentsWrite } from "@/lib/externalAssignments";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { cn } from "@/lib/utils";


interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[] | null;
  dispatch_type: string;
  status: string;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
}

interface ManualSendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  selectedChannel: Channel | null;
  onChannelChange: (channel: Channel) => void;
  initialPhone?: string;
  onPhoneUsed?: () => void;
  onTemplateSent?: (data: { 
    phone: string; 
    channelId: string; 
    templateName: string;
    templateContent: string;
  }) => void;
}

export const ManualSendDialog = ({ 
  isOpen, 
  onClose, 
  channels,
  selectedChannel,
  onChannelChange,
  initialPhone = "",
  onPhoneUsed,
  onTemplateSent
}: ManualSendDialogProps) => {
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"phone" | "template" | "variables">("phone");

  useEffect(() => {
    if (isOpen) {
      // Pre-fill the phone number if provided, but always start at phone step
      if (initialPhone) {
        setPhoneNumber(formatPhoneNumber(initialPhone));
        onPhoneUsed?.();
      }
      // Fetch templates if we have a channel selected
      if (selectedChannel) {
        fetchTemplates();
      }
    }
  }, [isOpen, selectedChannel, initialPhone]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setPhoneNumber("");
    setSelectedTemplate(null);
    setVariableValues({});
    setSearchTerm("");
    setStep("phone");
  };

  const fetchTemplates = async () => {
    if (!selectedChannel) return;
    
    setLoading(true);
    
    // First get templates linked to this channel
    const { data: channelTemplates, error: ctError } = await supabase
      .from("channel_templates")
      .select("template_id")
      .eq("channel_id", selectedChannel.id);

    if (ctError) {
      console.error("Error fetching channel templates:", ctError);
      setLoading(false);
      return;
    }

    const templateIds = channelTemplates?.map(ct => ct.template_id) || [];

    if (templateIds.length === 0) {
      setTemplates([]);
    } else {
      // Fetch templates linked to channel
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .in("id", templateIds)
        .order("name");

      if (!error && data) {
        setTemplates(data);
      }
    }

    setLoading(false);
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  };

  const buildBrazilDestination = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) return digits;
    return `55${digits}`;
  };

  const getFunctionErrorMessage = async (error: unknown) => {
    const rawCtx = (error as { context?: unknown } | null)?.context as
      | (Response & { response?: Response })
      | undefined;
    // Depending on the supabase-js version, `context` is either the Response
    // itself or an object shaped like `{ response }`.
    const resp: Response | undefined =
      rawCtx && typeof (rawCtx as Response).clone === "function"
        ? (rawCtx as Response)
        : rawCtx?.response;

    if (resp) {
      try {
        const body = await resp.clone().json();
        const msg = body?.error || body?.message || body?.details?.message;
        if (msg) return typeof msg === "string" ? msg : JSON.stringify(msg);
      } catch {
        // fall through to text below
      }
      try {
        const text = await resp.clone().text();
        if (text) return text.slice(0, 300);
      } catch {
        // ignore parse errors and use fallback below
      }
    }
    return (error as { message?: string } | null)?.message || "Erro ao enviar template";
  };


  const hasUnsupportedTemplateContent = (value: string) => {
    return /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|www\.whatsapp\.com)\S*/i.test(value)
      || /[\u00A0\u200B-\u200D\uFEFF]/.test(value)
      || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleContinueToTemplates = () => {
    if (!phoneNumber.trim()) {
      toast.error("Digite o número de telefone");
      return;
    }
    
    // Basic validation - should have at least 10 digits
    if (phoneNumber.length < 10) {
      toast.error("Número de telefone inválido");
      return;
    }

    setStep("template");
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Initialize variable values
    const initialValues: Record<string, string> = {};
    template.variables?.forEach((_, index) => {
      initialValues[`var_${index}`] = "";
    });
    setVariableValues(initialValues);
    setStep("variables");
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate || !selectedChannel) return;

    const params = selectedTemplate.variables?.map((_, index) => 
      variableValues[`var_${index}`] || ""
    ) || [];

    const hasEmptyVars = params.some(p => !p.trim());
    if (hasEmptyVars && (selectedTemplate.variables?.length || 0) > 0) {
      toast.error("Preencha todas as variáveis do template");
      return;
    }

    const invalidParam = params.find((param) => hasUnsupportedTemplateContent(param));
    if (invalidParam) {
      toast.error("As variáveis do template não podem conter emoji, link do WhatsApp ou caracteres invisíveis");
      return;
    }

    setSending(true);

    try {
      const formattedPhone = buildBrazilDestination(phoneNumber);

      // Resolve current user (needed by the atomic claim on the external DB).
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user?.id) {
        toast.error("Sessão expirada. Faça login novamente.");
        setSending(false);
        return;
      }
      const userId = authData.user.id;

      // Ownership-aware claim via external-assignments-write (SSoT). The edge
      // function expects `{ action, payload: { conversation_phone, channel_id, ... } }`.
      // Any attempt to claim a conversation that belongs to another attendant
      // returns `{ success: false, error: "already_assigned", assignment: {...} }`.
      const { data: claimData, error: claimError } = await supabase.functions.invoke(
        "external-assignments-write",
        {
          body: {
            action: "claim_assignment",
            // Super admins have no organization_id on their profile; when they are
            // impersonating an organization the edge function needs it explicitly,
            // otherwise it answers 403 "No organization" and the send never happens.
            ...(isImpersonating && effectiveOrganizationId
              ? { impersonatedOrgId: effectiveOrganizationId }
              : {}),
            payload: {
              conversation_phone: formattedPhone,
              channel_id: selectedChannel.id,
              assigned_to: userId,
              status: "in_progress",
            },
          },
        }
      );

      if (claimError) {
        const claimMessage = await getFunctionErrorMessage(claimError);
        toast.error(claimMessage || "Não foi possível reservar esta conversa");
        setSending(false);
        return;
      }


      if (claimData && typeof claimData === "object" && (claimData as any).error === "already_assigned") {
        const ownerId = (claimData as any).assignment?.assigned_to;
        let ownerName = "outro atendente";
        if (ownerId) {
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("display_name, email")
            .eq("user_id", ownerId)
            .maybeSingle();
          ownerName = ownerProfile?.display_name || ownerProfile?.email || ownerName;
        }
        toast.error(`Este atendimento já pertence a ${ownerName}`);
        setSending(false);
        return;
      }



      const { data, error } = await supabase.functions.invoke('meta-send', {
        body: {
          channelId: selectedChannel.id,
          destination: formattedPhone,
          messageType: 'template',
          templateName: selectedTemplate.name,
          templateParams: splitTemplateParams(selectedTemplate.variables, params).bodyParams,
          buttonParams: (() => {
            const bp = splitTemplateParams(selectedTemplate.variables, params).buttonParams;
            return bp.some((v) => v) ? bp : undefined;
          })()
        }
      });

      if (error) {
        console.error('Send template error:', error);
        const errorMessage = await getFunctionErrorMessage(error);
        toast.error(errorMessage || 'Erro ao enviar template', {
          description: 'A conversa foi mantida em Meus para você tentar novamente sem perder o contexto.',
          duration: 7000,
        });
        // Still notify parent so the conversation appears in "Meus"
        onTemplateSent?.({
          phone: formattedPhone,
          channelId: selectedChannel.id,
          templateName: selectedTemplate.name,
          templateContent: selectedTemplate.content
        });
        onClose();
        setSending(false);
        return;
      }

      if (data.success) {
        toast.success(`Template enviado para ${formattedPhone}!`);
      } else {
        toast.error(data.error || 'Erro ao enviar template', {
          description: data.messageId ? 'A tentativa foi salva no histórico como falha.' : undefined,
          duration: 7000,
        });
      }
      
      // Always notify parent so the conversation appears in "Meus" regardless of success/failure
      onTemplateSent?.({
        phone: formattedPhone,
        channelId: selectedChannel.id,
        templateName: selectedTemplate.name,
        templateContent: selectedTemplate.content
      });
      
      onClose();
    } catch (err) {
      console.error('Send template error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar template');
    }

    setSending(false);
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDispatchTypeLabel = (type: string) => {
    switch (type) {
      case "marketing": return "Marketing";
      case "utility": return "Utilitário";
      case "service": return "Serviço";
      default: return type;
    }
  };

  const getDispatchTypeClass = (type: string) => {
    switch (type) {
      case "marketing": return "bg-chart-3/10 text-chart-3 border-chart-3/30";
      case "utility": return "bg-info/10 text-info border-info/30";
      case "service": return "bg-success/10 text-success border-success/30";
      default: return "";
    }
  };

  // Preview template with variables filled in
  const getPreviewContent = () => {
    if (!selectedTemplate) return "";
    let content = selectedTemplate.content;
    selectedTemplate.variables?.forEach((_, index) => {
      const value = variableValues[`var_${index}`] || `{{${index + 1}}}`;
      content = content.replace(`{{${index + 1}}}`, value);
    });
    return content;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Enviar Mensagem Manual
          </DialogTitle>
        </DialogHeader>

        {step === "phone" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Canal de Envio</Label>
              <Select 
                value={selectedChannel?.id || ""} 
                onValueChange={(value) => {
                  const channel = channels.find(c => c.id === value);
                  if (channel) onChannelChange(channel);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name} ({channel.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Número de Telefone</Label>
              <div className="flex gap-2">
                <div className="flex items-center justify-center px-3 bg-muted rounded-md border border-border text-sm font-medium text-muted-foreground">
                  +55
                </div>
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    placeholder="11999999999"
                    className="pl-10"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    maxLength={11}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Digite o DDD + número (ex: 11999999999)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleContinueToTemplates} disabled={!selectedChannel}>
                Continuar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === "template" && (
          <>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setStep("phone")}
              className="mb-2 w-fit"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>

            <div className="p-3 rounded-lg bg-muted/30 border border-border mb-4">
              <p className="text-sm">
                <span className="text-muted-foreground">Enviando para:</span>{" "}
                <span className="font-medium">{phoneNumber}</span>
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar templates..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <ScrollArea className="h-[17.75rem] -mx-6 px-6">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum template encontrado</p>
                  <p className="text-sm mt-1">Sincronize os templates na página de Templates</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTemplates.map(template => (
                    <button
                      key={template.id}
                      className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {template.content}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", getDispatchTypeClass(template.dispatch_type))}>
                          {getDispatchTypeLabel(template.dispatch_type)}
                        </Badge>
                        {template.variables && template.variables.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {template.variables.length} variáveis
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {step === "variables" && selectedTemplate && (
          <div className="space-y-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setStep("template")}
              className="mb-2 w-fit"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>

            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-sm mb-1">
                <span className="text-muted-foreground">Enviando para:</span>{" "}
                <span className="font-medium">{phoneNumber}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Template:</span>{" "}
                <span className="font-medium">{selectedTemplate.name}</span>
              </p>
            </div>

            <div className="p-4 rounded-lg bg-card border border-border">
              <h4 className="font-medium mb-2 text-sm">Preview da Mensagem</h4>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{getPreviewContent()}</p>
            </div>

            {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Variáveis do Template</h4>
                {selectedTemplate.variables.map((variable, index) => (
                  <div key={index}>
                    <Label className="text-sm text-muted-foreground mb-1 block">
                      {templateVariableLabel(variable, index)}
                    </Label>
                    <Input
                      placeholder={`Valor para {{${index + 1}}}`}
                      value={variableValues[`var_${index}`] || ""}
                      onChange={(e) => setVariableValues(prev => ({
                        ...prev,
                        [`var_${index}`]: e.target.value
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSendTemplate} disabled={sending} className="gap-2">
                <Send className="w-4 h-4" />
                {sending ? "Enviando..." : "Enviar Template"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
