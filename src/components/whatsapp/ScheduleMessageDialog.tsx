import { useState, useEffect } from "react";
import { Calendar, Clock, Loader2, Send, FileText, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, addHours, setHours, setMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[] | null;
  dispatch_type: string;
  status: string;
}

interface ScheduleMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contactPhone: string;
  contactName?: string | null;
  channelId: string | null;
  leadId?: string | null;
}

export const ScheduleMessageDialog = ({ 
  isOpen, 
  onClose, 
  contactPhone,
  contactName,
  channelId,
  leadId
}: ScheduleMessageDialogProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState<Date | undefined>(addHours(new Date(), 1));
  const [time, setTime] = useState("12:00");
  const [scheduling, setScheduling] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && channelId) {
      fetchTemplates();
      fetchOrganizationId();
    }
  }, [isOpen, channelId]);

  const fetchOrganizationId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.organization_id) {
      setOrganizationId(profile.organization_id);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    
    // First get templates linked to this channel
    const { data: channelTemplates, error: ctError } = await supabase
      .from("channel_templates")
      .select("template_id")
      .eq("channel_id", channelId);

    if (ctError) {
      console.error("Error fetching channel templates:", ctError);
      setLoading(false);
      return;
    }

    const templateIds = channelTemplates?.map(ct => ct.template_id) || [];

    if (templateIds.length === 0) {
      // If no channel-specific templates, fetch all approved templates
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "approved")
        .order("name");

      if (!error && data) {
        setTemplates(data);
      }
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

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Initialize variable values
    const initialValues: Record<string, string> = {};
    template.variables?.forEach((v, index) => {
      initialValues[`var_${index}`] = "";
    });
    setVariableValues(initialValues);
  };

  const handleSchedule = async () => {
    if (!selectedTemplate) {
      toast.error("Selecione um template");
      return;
    }

    if (!date) {
      toast.error("Selecione uma data");
      return;
    }

    if (!channelId) {
      toast.error("Canal não selecionado");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledDate = setMinutes(setHours(date, hours), minutes);

    if (scheduledDate <= new Date()) {
      toast.error("A data/hora deve ser no futuro");
      return;
    }

    // Check if all variables are filled
    const params = selectedTemplate.variables?.map((_, index) => 
      variableValues[`var_${index}`] || ""
    ) || [];
    
    const hasEmptyVars = params.some(p => !p.trim());
    if (hasEmptyVars && (selectedTemplate.variables?.length || 0) > 0) {
      toast.error("Preencha todas as variáveis do template");
      return;
    }

    setScheduling(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Build variable values object for storage
      const storedVariables: Record<string, string> = {};
      selectedTemplate.variables?.forEach((_, index) => {
        storedVariables[`${index + 1}`] = variableValues[`var_${index}`] || "";
      });

      // Insert into scheduled_messages
      const { error } = await supabase
        .from("scheduled_messages")
        .insert({
          organization_id: organizationId,
          channel_id: channelId,
          lead_id: leadId || null,
          template_id: selectedTemplate.id,
          destination_phone: contactPhone,
          destination_name: contactName || null,
          variable_values: storedVariables,
          scheduled_at: scheduledDate.toISOString(),
          status: "pending",
          created_by: user.id
        });

      if (error) throw error;
      
      toast.success("Mensagem agendada com sucesso!", {
        description: `Template "${selectedTemplate.name}" será enviado em ${format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });
      
      resetForm();
      onClose();
    } catch (error) {
      console.error("Error scheduling message:", error);
      toast.error("Erro ao agendar mensagem");
    } finally {
      setScheduling(false);
    }
  };

  const resetForm = () => {
    setSelectedTemplate(null);
    setVariableValues({});
    setSearchTerm("");
    setDate(addHours(new Date(), 1));
    setTime("12:00");
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
      case "marketing": return "bg-purple-500/10 text-purple-500 border-purple-500/30";
      case "utility": return "bg-blue-500/10 text-blue-500 border-blue-500/30";
      case "service": return "bg-green-500/10 text-green-500 border-green-500/30";
      default: return "";
    }
  };

  // Preview template with variables filled in
  const getPreviewContent = () => {
    if (!selectedTemplate) return "";
    let content = selectedTemplate.content;
    selectedTemplate.variables?.forEach((v, index) => {
      const value = variableValues[`var_${index}`] || `{{${index + 1}}}`;
      content = content.replace(`{{${index + 1}}}`, value);
    });
    return content;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-warning" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Agendar template para ${contactName}`
              : "Selecione um template e agende o envio"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedTemplate ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar templates..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <ScrollArea className="flex-1 -mx-6 px-6">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Carregando templates...
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum template encontrado</p>
                    <p className="text-sm mt-1">Sincronize os templates na página de Conexões</p>
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
          ) : (
            <ScrollArea className="flex-1 -mx-6 px-6 max-h-[60vh]">
              <div className="space-y-4 pb-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedTemplate(null)}
                >
                  ← Voltar aos templates
                </Button>

                {/* Template Preview */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <h4 className="font-medium">{selectedTemplate.name}</h4>
                  </div>
                  <Badge variant="outline" className={cn("text-xs mb-3", getDispatchTypeClass(selectedTemplate.dispatch_type))}>
                    {getDispatchTypeLabel(selectedTemplate.dispatch_type)}
                  </Badge>
                  
                  <div className="p-3 rounded bg-card border border-border">
                    <p className="text-sm whitespace-pre-wrap">{getPreviewContent()}</p>
                  </div>
                </div>

                {/* Variables */}
                {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Variáveis do Template</h4>
                    {selectedTemplate.variables.map((variable, index) => (
                      <div key={index}>
                        <label className="text-sm text-muted-foreground mb-1 block">
                          {variable || `Variável ${index + 1}`}
                        </label>
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

                {/* Date & Time */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Data e Hora do Envio</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-popover" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Hora</Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {date && time && (
                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                    <p className="text-sm text-warning">
                      <strong>Envio programado:</strong>{" "}
                      {format(
                        setMinutes(setHours(date, parseInt(time.split(":")[0])), parseInt(time.split(":")[1])),
                        "EEEE, dd 'de' MMMM 'às' HH:mm",
                        { locale: ptBR }
                      )}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedTemplate && (
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleSchedule} disabled={!date || scheduling}>
              {scheduling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Agendando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Agendar Template
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
