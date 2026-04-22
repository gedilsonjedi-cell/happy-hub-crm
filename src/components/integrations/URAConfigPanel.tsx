import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { 
  Phone, 
  Copy, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  FileText,
  ExternalLink,
  Info,
  Webhook,
  Settings2
} from "lucide-react";

interface Channel {
  id: string;
  name: string;
  phone: string;
  waba_id: string | null;
}

interface Template {
  id: string;
  name: string;
  status: string;
}

interface URAConfig {
  id: string;
  channel_id: string;
  template_id: string | null;
  is_enabled: boolean;
  create_lead_if_not_exists: boolean;
}

export function URAConfigPanel() {
  const effectiveOrganizationId = useEffectiveOrganizationId();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<Map<string, Template[]>>(new Map());
  const [uraConfigs, setUraConfigs] = useState<Map<string, URAConfig>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const orgId = effectiveOrganizationId?.effectiveOrganizationId;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const fetchData = async () => {
    if (!orgId) return;
    
    setIsLoading(true);
    
    // Fetch channels with waba_id
    const { data: channelsData } = await (supabase as any)
      .from("channels_public")
      .select("id, name, phone, waba_id")
      .eq("organization_id", orgId)
      .eq("connected", true)
      .order("name");
    
    // Get unique waba_ids from channels
    const wabaIds = [...new Set((channelsData || []).map((c: any) => c.waba_id).filter(Boolean))] as string[];
    
    // Find all channel IDs that share these waba_ids (to get all templates for each waba)
    const { data: allChannelsWithSameWaba } = await (supabase as any)
      .from("channels_public")
      .select("id, waba_id")
      .in("waba_id", wabaIds);
    
    // Create a map of waba_id to channel_ids
    const wabaToChannels = new Map<string, string[]>();
    (allChannelsWithSameWaba || []).forEach((c: any) => {
      if (c.waba_id) {
        const existing = wabaToChannels.get(c.waba_id) || [];
        existing.push(c.id);
        wabaToChannels.set(c.waba_id, existing);
      }
    });
    
    // Get all channel IDs from all WABAs
    const allChannelIds = [...new Set((allChannelsWithSameWaba || []).map(c => c.id))];
    
    // Fetch channel templates with their template details for ALL channels in the same WABAs
    const { data: channelTemplatesData } = await supabase
      .from("channel_templates")
      .select(`
        channel_id,
        template:message_templates(id, name, status)
      `)
      .in("channel_id", allChannelIds.length > 0 ? allChannelIds : ['none']);
    
    // Fetch existing URA configs
    const { data: configsData } = await supabase
      .from("ura_config")
      .select("*")
      .eq("organization_id", orgId);
    
    setChannels(channelsData || []);
    
    // Group templates by waba_id first, then map to channels
    const wabaTemplates = new Map<string, Template[]>();
    (channelTemplatesData || []).forEach((ct: any) => {
      // Check for both lowercase and uppercase status (DB stores lowercase)
      if (ct.template && (ct.template.status === "approved" || ct.template.status === "APPROVED")) {
        // Find which waba_id this channel belongs to
        const channel = allChannelsWithSameWaba?.find(c => c.id === ct.channel_id);
        if (channel?.waba_id) {
          const existing = wabaTemplates.get(channel.waba_id) || [];
          // Avoid duplicates
          if (!existing.some(t => t.id === ct.template.id)) {
            existing.push(ct.template);
          }
          wabaTemplates.set(channel.waba_id, existing);
        }
      }
    });
    
    // Now map templates to each channel based on their waba_id
    const templatesMap = new Map<string, Template[]>();
    (channelsData || []).forEach((channel) => {
      if (channel.waba_id) {
        templatesMap.set(channel.id, wabaTemplates.get(channel.waba_id) || []);
      }
    });
    setChannelTemplates(templatesMap);
    
    const configsMap = new Map<string, URAConfig>();
    (configsData || []).forEach((config: URAConfig) => {
      configsMap.set(config.channel_id, config);
    });
    setUraConfigs(configsMap);
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const getWebhookUrl = (channelId: string) => {
    return `${supabaseUrl}/functions/v1/ura-webhook/${channelId}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("URL copiada!");
  };

  const handleToggleEnabled = async (channelId: string, currentValue: boolean) => {
    const existingConfig = uraConfigs.get(channelId);
    setSaving(channelId);
    
    try {
      if (existingConfig) {
        const { error } = await supabase
          .from("ura_config")
          .update({ is_enabled: !currentValue })
          .eq("id", existingConfig.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ura_config")
          .insert({
            channel_id: channelId,
            organization_id: orgId,
            is_enabled: true,
            create_lead_if_not_exists: true
          });
        
        if (error) throw error;
      }
      
      toast.success(!currentValue ? "URA ativada!" : "URA desativada");
      fetchData();
    } catch (error) {
      console.error("Error toggling URA:", error);
      toast.error("Erro ao alterar configuração");
    } finally {
      setSaving(null);
    }
  };

  const handleTemplateChange = async (channelId: string, templateId: string) => {
    const existingConfig = uraConfigs.get(channelId);
    setSaving(channelId);
    
    try {
      if (existingConfig) {
        const { error } = await supabase
          .from("ura_config")
          .update({ template_id: templateId === "none" ? null : templateId })
          .eq("id", existingConfig.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ura_config")
          .insert({
            channel_id: channelId,
            organization_id: orgId,
            template_id: templateId === "none" ? null : templateId,
            is_enabled: true,
            create_lead_if_not_exists: true
          });
        
        if (error) throw error;
      }
      
      toast.success("Template atualizado!");
      fetchData();
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Erro ao atualizar template");
    } finally {
      setSaving(null);
    }
  };

  const handleLeadCreationToggle = async (channelId: string, currentValue: boolean) => {
    const existingConfig = uraConfigs.get(channelId);
    if (!existingConfig) return;
    
    setSaving(channelId);
    
    try {
      const { error } = await supabase
        .from("ura_config")
        .update({ create_lead_if_not_exists: !currentValue })
        .eq("id", existingConfig.id);
      
      if (error) throw error;
      
      toast.success("Configuração atualizada!");
      fetchData();
    } catch (error) {
      console.error("Error updating lead creation:", error);
      toast.error("Erro ao atualizar configuração");
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardContent className="flex gap-4 p-4">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Como funciona a integração URA:</strong>
            </p>
            <ol className="text-sm text-blue-800 dark:text-blue-200 list-decimal list-inside space-y-1">
              <li>Configure o template que será enviado para cada canal</li>
              <li>Copie a URL do webhook do canal</li>
              <li>No sistema de URA (SolutionsVOIP), adicione um bloco de "API/Webhook" após a opção de interesse</li>
              <li>Configure o webhook para enviar um POST com o campo <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">phone</code> (telefone do cliente)</li>
              <li>Quando o cliente ligar e selecionar a opção, o template será enviado automaticamente</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Main Config Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Configuração de URA por Canal
          </CardTitle>
          <CardDescription>
            Configure qual template será enviado quando a URA acionar cada canal
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum canal conectado</p>
              <p className="text-sm">Conecte um canal do WhatsApp para configurar a URA</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-450px)] min-h-[300px] max-h-[600px] pr-4">
              <div className="space-y-4 pb-2">
                {channels.map((channel) => {
                  const config = uraConfigs.get(channel.id);
                  const isEnabled = config?.is_enabled ?? false;
                  const templateId = config?.template_id ?? null;
                  const createLead = config?.create_lead_if_not_exists ?? true;
                  const webhookUrl = getWebhookUrl(channel.id);
                  const isSaving = saving === channel.id;
                  const templatesForChannel = channelTemplates.get(channel.id) || [];
                  
                  return (
                    <div
                      key={channel.id}
                      className="border rounded-lg p-4 space-y-4"
                    >
                      {/* Channel Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${isEnabled ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                            {isEnabled ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium">{channel.name}</h4>
                            <p className="text-sm text-muted-foreground">{channel.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSaving && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleToggleEnabled(channel.id, isEnabled)}
                            disabled={isSaving}
                          />
                        </div>
                      </div>

                      {/* Webhook URL */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Webhook className="h-3 w-3" />
                          URL do Webhook (configure na URA)
                        </Label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-muted px-3 py-2 rounded text-xs truncate">
                            {webhookUrl}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(webhookUrl)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Template Selection */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Template a enviar
                          </Label>
                          <Select
                            value={templateId || "none"}
                            onValueChange={(value) => handleTemplateChange(channel.id, value)}
                            disabled={isSaving}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum template</SelectItem>
                              {templatesForChannel.length === 0 ? (
                                <SelectItem value="_empty" disabled>
                                  Nenhum template aprovado neste canal
                                </SelectItem>
                              ) : (
                                templatesForChannel.map((template) => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            <Settings2 className="h-3 w-3" />
                            Opções
                          </Label>
                          <div className="flex items-center justify-between p-3 border rounded-md">
                            <span className="text-sm">Criar lead se não existir</span>
                            <Switch
                              checked={createLead}
                              onCheckedChange={() => handleLeadCreationToggle(channel.id, createLead)}
                              disabled={isSaving || !config}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        {isEnabled && templateId ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Pronto para uso
                          </Badge>
                        ) : isEnabled && !templateId ? (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            Selecione um template
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Desativado
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* API Documentation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4" />
            Parâmetros do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O webhook aceita requisições <strong>GET</strong> ou <strong>POST</strong> com os seguintes parâmetros:
          </p>
          
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Campos aceitos (qualquer um deles):</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><code className="bg-background px-1 rounded">phone</code> - Telefone do cliente</li>
              <li><code className="bg-background px-1 rounded">caller_phone</code> - Telefone do cliente</li>
              <li><code className="bg-background px-1 rounded">numero</code> - Telefone do cliente</li>
              <li><code className="bg-background px-1 rounded">telefone</code> - Telefone do cliente</li>
            </ul>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Exemplo de requisição POST:</p>
            <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`POST /functions/v1/ura-webhook/{channel_id}
Content-Type: application/json

{
  "phone": "5511999999999"
}`}
            </pre>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Exemplo de requisição GET:</p>
            <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`GET /functions/v1/ura-webhook/{channel_id}?phone=5511999999999`}
            </pre>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Resposta de sucesso:</p>
            <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`{
  "success": true,
  "message": "Template sent successfully",
  "phone": "5511999999999",
  "template": "nome_do_template",
  "lead_created": false
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
