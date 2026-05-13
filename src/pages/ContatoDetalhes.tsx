import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Calendar,
  Edit,
  Trash2,
  MessageCircle,
  Tag,
  User,
  Send,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";
import { DeleteLeadDialog } from "@/components/leads/DeleteLeadDialog";
import { AssignTagsDialog } from "@/components/leads/AssignTagsDialog";
import { ManualSendDialog } from "@/components/whatsapp/ManualSendDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchExternalMessagesForLead } from "@/lib/externalDb";

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
  tags: string[] | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  stage_id: string | null;
}

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

interface CustomFieldDefinition {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
}

interface WhatsAppMessage {
  id: string;
  channel_id: string | null;
  content: string | null;
  direction: string;
  message_type: string;
  created_at: string;
  sender_name: string | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-primary/10 text-primary border-primary/30" },
  contacted: { label: "Contatado", className: "bg-warning/10 text-warning border-warning/30" },
  qualified: { label: "Qualificado", className: "bg-blue-500/10 text-blue-400 border-blue-400/30" },
  converted: { label: "Convertido", className: "bg-primary/10 text-primary border-primary/30" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground border-border" },
};

const ContatoDetalhes = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    effectiveOrganizationId: organizationId,
    isImpersonating,
    impersonatedOrganizationId,
  } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const externalImpersonatedOrgId = isImpersonating ? impersonatedOrganizationId ?? null : null;
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [showManualSendDialog, setShowManualSendDialog] = useState(false);
  const [checkingConversation, setCheckingConversation] = useState(false);

  // Fetch available channels
  const { data: channels = [] } = useQuery({
    queryKey: ["channels", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await (supabase as any)
        .from("channels_public")
        .select("id, name, phone, provider")
        .eq("organization_id", organizationId)
        .in("provider", ["meta", "zapi", "gupshup"])
        .eq("connected", true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const [selectedChannel, setSelectedChannel] = useState<typeof channels[0] | null>(null);

  // Set default channel when channels are loaded
  useEffect(() => {
    if (channels.length > 0 && !selectedChannel) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

  // Fetch lead details
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead-details", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Lead;
    },
    enabled: !!id,
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ["lead-tags", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("lead_tags")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name");

      if (error) throw error;
      return (data || []) as LeadTag[];
    },
    enabled: !!organizationId,
  });

  // Fetch custom field definitions
  const { data: customFields = [] } = useQuery({
    queryKey: ["custom-field-definitions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("id, field_name, field_label, field_type")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as CustomFieldDefinition[];
    },
    enabled: !!organizationId,
  });

  // Fetch message history
  const { data: messages = [] } = useQuery({
    queryKey: ["lead-messages", organizationId, lead?.phone, channels.map((c: any) => c.id).join("|")],
    queryFn: async () => {
      if (!lead?.phone || !organizationId) return [];

      return fetchExternalMessagesForLead({
        phone: lead.phone,
        organizationId,
        channelIds: channels.map((channel: any) => channel.id),
        impersonatedOrgId: externalImpersonatedOrgId,
        limit: 100,
      }) as Promise<WhatsAppMessage[]>;
    },
    enabled: !!lead?.phone && !!organizationId && channels.length > 0,
  });

  const handleLeadUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["lead-details", id] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const handleLeadDeleted = () => {
    navigate("/leads");
  };

  // Handle starting a conversation - check if there's an active conversation first
  const handleStartConversation = async () => {
    if (!lead || !organizationId) return;

    // Check if we have channels
    if (channels.length === 0) {
      toast.error("Nenhum canal conectado. Conecte um número de WhatsApp primeiro.");
      return;
    }

    setCheckingConversation(true);

    try {
      const cleanPhone = lead.phone.replace(/\D/g, "");

      // Check if there's an existing conversation with messages
      const { data: existingMessages, error } = await supabase
        .from("whatsapp_messages")
        .select("id, channel_id")
        .eq("organization_id", organizationId)
        .eq("sender_phone", cleanPhone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (existingMessages && existingMessages.length > 0) {
        // There's an existing conversation - navigate to chat with phone pre-selected
        toast.success("Abrindo conversa existente...");
        navigate(`/atendimento?phone=${cleanPhone}`);
      } else {
        // No existing conversation - open the manual send dialog
        if (!selectedChannel && channels.length > 0) {
          setSelectedChannel(channels[0]);
        }
        setShowManualSendDialog(true);
      }
    } catch (error) {
      console.error("Error checking conversation:", error);
      toast.error("Erro ao verificar conversa");
      // Fallback to opening manual send dialog
      if (!selectedChannel && channels.length > 0) {
        setSelectedChannel(channels[0]);
      }
      setShowManualSendDialog(true);
    } finally {
      setCheckingConversation(false);
    }
  };

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!lead) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Contato não encontrado</p>
          <Button variant="outline" onClick={() => navigate("/leads")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Contatos
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/leads")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {lead.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{lead.name}</h1>
              <Badge 
                variant="outline" 
                className={cn("text-xs mt-1", statusConfig[lead.status || "new"]?.className)}
              >
                {statusConfig[lead.status || "new"]?.label || lead.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button 
            size="sm" 
            onClick={handleStartConversation}
            disabled={checkingConversation}
            className="gap-2"
          >
            {checkingConversation ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Iniciar Conversa
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTagsDialog(true)}>
            <Tag className="w-4 h-4 mr-2" />
            Tags
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Contact Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Informações de Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefone</p>
                    <p className="font-medium">{formatPhone(lead.phone)}</p>
                  </div>
                </div>
                
                {lead.email && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <p className="font-medium">{lead.email}</p>
                    </div>
                  </div>
                )}

                {lead.document && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CPF/CNPJ</p>
                      <p className="font-medium">{lead.document}</p>
                    </div>
                  </div>
                )}

                {(lead.city || lead.state) && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Localização</p>
                      <p className="font-medium">
                        {[lead.city, lead.state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cadastrado em</p>
                    <p className="font-medium">
                      {format(new Date(lead.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {lead.tags.map((tagName) => {
                        const tag = availableTags.find(t => t.name === tagName);
                        return (
                          <Badge 
                            key={tagName} 
                            variant="outline"
                            style={{
                              backgroundColor: tag ? tag.color + "15" : undefined,
                              borderColor: tag?.color,
                            }}
                          >
                            {tag && (
                              <span
                                className="w-2 h-2 rounded-full mr-1.5"
                                style={{ backgroundColor: tag.color }}
                              />
                            )}
                            {tagName}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              {lead.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Observações</p>
                    <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Custom Fields */}
          {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Campos Personalizados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(lead.custom_fields).map(([key, value]) => {
                    const fieldDef = customFields.find(f => f.field_name === key);
                    return (
                      <div key={key} className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {fieldDef?.field_label || key}
                        </p>
                        <p className="font-medium">
                          {fieldDef?.field_type === "boolean" 
                            ? (value === "true" ? "Sim" : "Não")
                            : value || "—"
                          }
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Message History */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Histórico de Mensagens
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem encontrada
                </p>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div 
                        key={msg.id}
                        className={cn(
                          "p-3 rounded-lg text-sm",
                          msg.direction === "outbound" 
                            ? "bg-primary/10 ml-4" 
                            : "bg-muted mr-4"
                        )}
                      >
                        <p className="whitespace-pre-wrap">
                          {msg.content || `[${msg.message_type}]`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(msg.created_at), "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <EditLeadDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        lead={lead}
        onSuccess={handleLeadUpdated}
      />

      <DeleteLeadDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        leadId={lead.id}
        leadName={lead.name}
        onSuccess={handleLeadDeleted}
      />

      <AssignTagsDialog
        open={showTagsDialog}
        onOpenChange={setShowTagsDialog}
        leadId={lead.id}
        leadName={lead.name}
        leadPhone={lead.phone}
        currentTags={lead.tags || []}
        onSuccess={handleLeadUpdated}
      />

      {selectedChannel && (
        <ManualSendDialog
          isOpen={showManualSendDialog}
          onClose={() => setShowManualSendDialog(false)}
          channels={channels}
          selectedChannel={selectedChannel}
          onChannelChange={setSelectedChannel}
          initialPhone={lead.phone.replace(/\D/g, "").replace(/^55/, "")}
          onPhoneUsed={() => {}}
        />
      )}
    </MainLayout>
  );
};

export default ContatoDetalhes;
