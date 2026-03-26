import { useState, useEffect } from "react";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { 
  FileText, 
  Search, 
  X,
  Send,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[] | null;
  dispatch_type: string;
  status: string;
}

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (templateName: string, templateParams: string[]) => void;
  channelId: string | null;
}

export const TemplateSelector = ({ 
  isOpen, 
  onClose, 
  onSend,
  channelId 
}: TemplateSelectorProps) => {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && channelId) {
      fetchTemplates();
    }
  }, [isOpen, channelId]);

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
      // If no channel-specific templates, fetch all approved templates for this org
      const query = supabase
        .from("message_templates")
        .select("*")
        .eq("status", "approved");
      if (effectiveOrganizationId) query.eq("organization_id", effectiveOrganizationId);
      const { data, error } = await query.order("name");

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

  const handleSendTemplate = () => {
    if (!selectedTemplate) return;

    const params = selectedTemplate.variables?.map((_, index) => 
      variableValues[`var_${index}`] || ""
    ) || [];

    // Check if all variables are filled
    const hasEmptyVars = params.some(p => !p.trim());
    if (hasEmptyVars && (selectedTemplate.variables?.length || 0) > 0) {
      toast.error("Preencha todas as variáveis do template");
      return;
    }

    onSend(selectedTemplate.name, params);
    handleClose();
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setVariableValues({});
    setSearchTerm("");
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
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {selectedTemplate ? "Configurar Template" : "Selecionar Template"}
          </DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar templates..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <ScrollArea className="h-[400px] -mx-6 px-6">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
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
          <div className="space-y-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedTemplate(null)}
              className="mb-2"
            >
              ← Voltar
            </Button>

            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <h4 className="font-medium mb-1">{selectedTemplate.name}</h4>
              <Badge variant="outline" className={cn("text-xs mb-3", getDispatchTypeClass(selectedTemplate.dispatch_type))}>
                {getDispatchTypeLabel(selectedTemplate.dispatch_type)}
              </Badge>
              
              <div className="p-3 rounded bg-card border border-border">
                <p className="text-sm whitespace-pre-wrap">{getPreviewContent()}</p>
              </div>
            </div>

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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleSendTemplate} className="gap-2">
                <Send className="w-4 h-4" />
                Enviar Template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
