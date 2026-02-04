import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Edit, 
  Copy, 
  ExternalLink,
  Zap,
  Globe,
  CheckCircle,
  XCircle,
  RefreshCw,
  BookOpen,
  Code,
  FileJson,
  Terminal,
  ArrowRight,
  CheckCheck,
  AlertCircle,
  Info,
  Phone
} from "lucide-react";
import { URAConfigPanel } from "@/components/integrations/URAConfigPanel";

interface WebhookData {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  headers: Record<string, string>;
  created_at: string;
}

const WEBHOOK_EVENTS = [
  { id: "message_created", label: "Mensagem criada", description: "Disparado quando uma nova mensagem é recebida" },
  { id: "message_updated", label: "Mensagem atualizada", description: "Disparado quando o status de uma mensagem muda" },
  { id: "conversation_created", label: "Conversa criada", description: "Disparado quando uma nova conversa é iniciada" },
  { id: "conversation_status_changed", label: "Status de conversa alterado", description: "Disparado quando o status da conversa muda" },
  { id: "contact_created", label: "Contato criado", description: "Disparado quando um novo lead é cadastrado" },
  { id: "contact_updated", label: "Contato atualizado", description: "Disparado quando um lead é atualizado" },
  { id: "pipeline_stage_changed", label: "Etapa do pipeline alterada", description: "Disparado quando um lead muda de etapa" },
  { id: "campaign_completed", label: "Campanha concluída", description: "Disparado quando uma campanha termina" },
];

const Integracoes = () => {
  const { user } = useAuth();
  const effectiveOrganizationId = useEffectiveOrganizationId();
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookData | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    events: [] as string[],
  });

  const orgId = effectiveOrganizationId?.effectiveOrganizationId;

  const fetchWebhooks = async () => {
    if (!orgId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from("webhooks")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching webhooks:", error);
      toast.error("Erro ao carregar webhooks");
    } else {
      setWebhooks((data || []).map(w => ({
        ...w,
        headers: (w.headers as Record<string, string>) || {}
      })));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchWebhooks();
  }, [orgId]);

  const handleEventToggle = (eventId: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId]
    }));
  };

  const resetForm = () => {
    setFormData({ name: "", url: "", events: [] });
    setEditingWebhook(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!formData.url.trim()) {
      toast.error("URL é obrigatória");
      return;
    }
    if (formData.events.length === 0) {
      toast.error("Selecione pelo menos um evento");
      return;
    }

    try {
      new URL(formData.url);
    } catch {
      toast.error("URL inválida");
      return;
    }

    if (editingWebhook) {
      const { error } = await supabase
        .from("webhooks")
        .update({
          name: formData.name.trim(),
          url: formData.url.trim(),
          events: formData.events,
        })
        .eq("id", editingWebhook.id);

      if (error) {
        toast.error("Erro ao atualizar webhook");
        return;
      }
      toast.success("Webhook atualizado!");
    } else {
      const { error } = await supabase
        .from("webhooks")
        .insert([{
          name: formData.name.trim(),
          url: formData.url.trim(),
          events: formData.events,
          organization_id: orgId,
          created_by: user?.id || '',
        }]);

      if (error) {
        toast.error("Erro ao criar webhook");
        return;
      }
      toast.success("Webhook criado!");
    }

    setDialogOpen(false);
    resetForm();
    fetchWebhooks();
  };

  const handleEdit = (webhook: WebhookData) => {
    setEditingWebhook(webhook);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("webhooks")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir webhook");
      return;
    }
    toast.success("Webhook excluído!");
    fetchWebhooks();
  };

  const handleToggleActive = async (webhook: WebhookData) => {
    const { error } = await supabase
      .from("webhooks")
      .update({ is_active: !webhook.is_active })
      .eq("id", webhook.id);

    if (error) {
      toast.error("Erro ao alterar status");
      return;
    }
    toast.success(webhook.is_active ? "Webhook desativado" : "Webhook ativado");
    fetchWebhooks();
  };

  const handleTestWebhook = async (webhook: WebhookData) => {
    toast.info("Enviando teste...");
    
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...webhook.headers,
        },
        body: JSON.stringify({
          event: "test",
          timestamp: new Date().toISOString(),
          data: {
            message: "Este é um teste de webhook do Optimus CRM",
          },
        }),
      });

      if (response.ok) {
        toast.success("Webhook testado com sucesso!");
      } else {
        toast.error(`Erro no teste: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      toast.error("Erro ao testar webhook. Verifique a URL e CORS.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Integrações</h1>
            <p className="text-muted-foreground">
              Conecte seu CRM com outras plataformas via webhooks
            </p>
          </div>
        </div>

        <Tabs defaultValue="webhooks" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="ura" className="gap-2">
              <Phone className="h-4 w-4" />
              URA
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-2">
              <Zap className="h-4 w-4" />
              Automações
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Documentação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Webhooks
                    </CardTitle>
                    <CardDescription>
                      Configure webhooks para receber notificações em tempo real. 
                      Compatível com N8N, Make, Zapier e outras plataformas.
                    </CardDescription>
                  </div>
                  <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                  }}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Novo Webhook
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingWebhook ? "Editar Webhook" : "Novo Webhook"}
                        </DialogTitle>
                        <DialogDescription>
                          Configure o endpoint e os eventos que deseja receber
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nome</Label>
                          <Input
                            id="name"
                            placeholder="Ex: Integração N8N"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="url">URL do Webhook</Label>
                          <Input
                            id="url"
                            placeholder="https://n8n.seudominio.com/webhook/..."
                            value={formData.url}
                            onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                          />
                          <p className="text-xs text-muted-foreground">
                            Cole a URL do webhook fornecida pela plataforma de automação
                          </p>
                        </div>

                        <div className="space-y-3">
                          <Label>Eventos</Label>
                          <p className="text-xs text-muted-foreground">
                            Selecione os eventos que dispararão o webhook
                          </p>
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {WEBHOOK_EVENTS.map((event) => (
                              <div
                                key={event.id}
                                className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleEventToggle(event.id)}
                              >
                                <Checkbox
                                  checked={formData.events.includes(event.id)}
                                  onCheckedChange={() => handleEventToggle(event.id)}
                                />
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium">{event.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {event.description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                          <Button variant="outline" onClick={() => {
                            setDialogOpen(false);
                            resetForm();
                          }}>
                            Cancelar
                          </Button>
                          <Button onClick={handleSave}>
                            {editingWebhook ? "Atualizar" : "Criar"} Webhook
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : webhooks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum webhook configurado</p>
                    <p className="text-sm">Crie um webhook para integrar com N8N, Make, Zapier e outras plataformas</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {webhooks.map((webhook) => (
                      <div
                        key={webhook.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${webhook.is_active ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                              {webhook.is_active ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium">{webhook.name}</h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <code className="bg-muted px-2 py-0.5 rounded text-xs truncate max-w-[300px]">
                                  {webhook.url}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(webhook.url)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={webhook.is_active}
                              onCheckedChange={() => handleToggleActive(webhook)}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestWebhook(webhook)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Testar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(webhook)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir webhook?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. O webhook será permanentemente removido.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(webhook.id)}>
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.map((eventId) => {
                            const event = WEBHOOK_EVENTS.find(e => e.id === eventId);
                            return (
                              <Badge key={eventId} variant="secondary" className="text-xs">
                                {event?.label || eventId}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ura" className="space-y-4">
            <URAConfigPanel />
          </TabsContent>

          <TabsContent value="automations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Plataformas de Automação
                </CardTitle>
                <CardDescription>
                  Conecte-se facilmente com as principais plataformas de automação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                      <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center mb-3">
                        <span className="text-orange-600 font-bold text-lg">n8n</span>
                      </div>
                      <h4 className="font-medium">N8N</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automação open-source poderosa
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <a href="https://n8n.io" target="_blank" rel="noopener noreferrer">
                          Saiba mais
                        </a>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                      <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                        <span className="text-purple-600 font-bold text-lg">M</span>
                      </div>
                      <h4 className="font-medium">Make (Integromat)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automação visual e intuitiva
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <a href="https://make.com" target="_blank" rel="noopener noreferrer">
                          Saiba mais
                        </a>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                      <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
                        <Zap className="h-6 w-6 text-amber-600" />
                      </div>
                      <h4 className="font-medium">Zapier</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Conecte +5000 aplicativos
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <a href="https://zapier.com" target="_blank" rel="noopener noreferrer">
                          Saiba mais
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Como configurar:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Crie um webhook na plataforma de automação de sua escolha</li>
                    <li>Copie a URL do webhook gerada</li>
                    <li>Adicione um novo webhook nesta página com a URL copiada</li>
                    <li>Selecione os eventos que deseja receber</li>
                    <li>Use o botão "Testar" para verificar a conexão</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Documentação da API de Webhooks
                </CardTitle>
                <CardDescription>
                  Guia completo para integração com o Optimus CRM via webhooks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {/* Introdução */}
                  <AccordionItem value="intro">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        Introdução
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        Os webhooks permitem que sua aplicação receba notificações em tempo real 
                        quando eventos ocorrem no Optimus CRM. Em vez de fazer polling contínuo 
                        para verificar mudanças, você recebe os dados automaticamente assim que 
                        o evento acontece.
                      </p>
                      <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <CheckCheck className="h-4 w-4 text-green-500" />
                          Benefícios dos Webhooks
                        </h4>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Notificações em tempo real</li>
                          <li>Menor consumo de recursos (sem polling)</li>
                          <li>Integração simples com qualquer plataforma</li>
                          <li>Suporte a múltiplos eventos simultâneos</li>
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Estrutura do Payload */}
                  <AccordionItem value="payload">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-primary" />
                        Estrutura do Payload
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        Todas as requisições de webhook são enviadas como POST com Content-Type: application/json.
                      </p>
                      <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                        <pre className="text-sm font-mono">{`{
  "event": "contact_created",
  "timestamp": "2024-01-15T14:30:00.000Z",
  "organization_id": "uuid-da-organizacao",
  "data": {
    // Dados específicos do evento
  }
}`}</pre>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium">Campos do Payload:</h4>
                        <div className="grid gap-2">
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded">event</code>
                            <span className="text-muted-foreground">Tipo do evento disparado</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded">timestamp</code>
                            <span className="text-muted-foreground">Data/hora do evento (ISO 8601)</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded">organization_id</code>
                            <span className="text-muted-foreground">ID da organização</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded">data</code>
                            <span className="text-muted-foreground">Objeto com dados específicos do evento</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Eventos Disponíveis */}
                  <AccordionItem value="events">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Eventos Disponíveis
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        {/* message_created */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">message_created</Badge>
                            <span className="text-sm font-medium">Mensagem Criada</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Disparado quando uma nova mensagem é recebida no WhatsApp.
                          </p>
                          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto">
                            <pre className="font-mono">{`{
  "event": "message_created",
  "data": {
    "message_id": "abc123",
    "phone": "5511999999999",
    "content": "Olá, gostaria de saber mais...",
    "direction": "incoming",
    "channel_id": "channel-uuid"
  }
}`}</pre>
                          </div>
                        </div>

                        {/* contact_created */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">contact_created</Badge>
                            <span className="text-sm font-medium">Contato/Lead Criado</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Disparado quando um novo lead é cadastrado no CRM.
                          </p>
                          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto">
                            <pre className="font-mono">{`{
  "event": "contact_created",
  "data": {
    "lead_id": "lead-uuid",
    "name": "João Silva",
    "phone": "5511999999999",
    "email": "joao@email.com",
    "tags": ["interessado", "whatsapp"]
  }
}`}</pre>
                          </div>
                        </div>

                        {/* contact_updated */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">contact_updated</Badge>
                            <span className="text-sm font-medium">Contato Atualizado</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Disparado quando informações de um lead são modificadas.
                          </p>
                          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto">
                            <pre className="font-mono">{`{
  "event": "contact_updated",
  "data": {
    "lead_id": "lead-uuid",
    "changes": {
      "name": { "old": "João", "new": "João Silva" },
      "email": { "old": null, "new": "joao@email.com" }
    }
  }
}`}</pre>
                          </div>
                        </div>

                        {/* pipeline_stage_changed */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">pipeline_stage_changed</Badge>
                            <span className="text-sm font-medium">Etapa do Pipeline Alterada</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Disparado quando um lead muda de etapa no funil de vendas.
                          </p>
                          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto">
                            <pre className="font-mono">{`{
  "event": "pipeline_stage_changed",
  "data": {
    "lead_id": "lead-uuid",
    "lead_name": "João Silva",
    "previous_stage": {
      "id": "stage-1",
      "name": "Novo Lead"
    },
    "new_stage": {
      "id": "stage-2",
      "name": "Em Negociação"
    }
  }
}`}</pre>
                          </div>
                        </div>

                        {/* campaign_completed */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">campaign_completed</Badge>
                            <span className="text-sm font-medium">Campanha Concluída</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Disparado quando uma campanha de disparos é finalizada.
                          </p>
                          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto">
                            <pre className="font-mono">{`{
  "event": "campaign_completed",
  "data": {
    "campaign_id": "campaign-uuid",
    "name": "Black Friday 2024",
    "total_recipients": 1500,
    "sent_count": 1485,
    "delivered_count": 1420,
    "failed_count": 15
  }
}`}</pre>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Guia N8N */}
                  <AccordionItem value="n8n">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-orange-500 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-white">n8n</span>
                        </div>
                        Integração com N8N
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        O N8N é uma plataforma de automação poderosa e open-source. 
                        Siga os passos abaixo para configurar a integração:
                      </p>
                      
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <h4 className="font-medium">Crie um novo Workflow</h4>
                            <p className="text-sm text-muted-foreground">No N8N, clique em "Create new workflow"</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <h4 className="font-medium">Adicione o nó Webhook</h4>
                            <p className="text-sm text-muted-foreground">Busque por "Webhook" e arraste para o canvas</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <h4 className="font-medium">Configure o Webhook</h4>
                            <p className="text-sm text-muted-foreground">Selecione HTTP Method: POST</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
                          <div>
                            <h4 className="font-medium">Copie a URL do Webhook</h4>
                            <p className="text-sm text-muted-foreground">Clique em "Production URL" e copie o link</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
                          <div>
                            <h4 className="font-medium">Configure no Optimus CRM</h4>
                            <p className="text-sm text-muted-foreground">Cole a URL na aba Webhooks e selecione os eventos</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-muted p-4 rounded-lg mt-4">
                        <h4 className="font-medium mb-2">Exemplo de fluxo N8N:</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="secondary">Webhook</Badge>
                          <ArrowRight className="h-4 w-4" />
                          <Badge variant="secondary">IF (evento)</Badge>
                          <ArrowRight className="h-4 w-4" />
                          <Badge variant="secondary">GPT/Claude</Badge>
                          <ArrowRight className="h-4 w-4" />
                          <Badge variant="secondary">Resposta</Badge>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Guia Make */}
                  <AccordionItem value="make">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-purple-500 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">M</span>
                        </div>
                        Integração com Make (Integromat)
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        O Make oferece uma interface visual intuitiva para criar automações.
                      </p>
                      
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <h4 className="font-medium">Crie um novo Scenario</h4>
                            <p className="text-sm text-muted-foreground">No Make, clique em "Create a new scenario"</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <h4 className="font-medium">Adicione o módulo Webhooks</h4>
                            <p className="text-sm text-muted-foreground">Busque "Webhooks" e selecione "Custom webhook"</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <h4 className="font-medium">Crie o Webhook</h4>
                            <p className="text-sm text-muted-foreground">Clique em "Add" para criar um novo webhook</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
                          <div>
                            <h4 className="font-medium">Copie a URL</h4>
                            <p className="text-sm text-muted-foreground">Copie o endereço gerado pelo Make</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
                          <div>
                            <h4 className="font-medium">Configure e Teste</h4>
                            <p className="text-sm text-muted-foreground">Cole a URL no Optimus e use "Testar" para validar</p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Guia Zapier */}
                  <AccordionItem value="zapier">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Integração com Zapier
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        O Zapier conecta mais de 5.000 aplicativos de forma simples.
                      </p>
                      
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <h4 className="font-medium">Crie um novo Zap</h4>
                            <p className="text-sm text-muted-foreground">Clique em "Create Zap" no Zapier</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <h4 className="font-medium">Escolha o Trigger</h4>
                            <p className="text-sm text-muted-foreground">Busque "Webhooks by Zapier" → "Catch Hook"</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <h4 className="font-medium">Copie a URL do Hook</h4>
                            <p className="text-sm text-muted-foreground">O Zapier irá gerar uma URL única para você</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
                          <div>
                            <h4 className="font-medium">Configure no Optimus</h4>
                            <p className="text-sm text-muted-foreground">Cole a URL e selecione os eventos desejados</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
                          <div>
                            <h4 className="font-medium">Teste e publique</h4>
                            <p className="text-sm text-muted-foreground">Use "Testar" no Optimus e depois "Publish" no Zapier</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-amber-700 dark:text-amber-400">Importante</h4>
                            <p className="text-sm text-muted-foreground">
                              O Zapier utiliza CORS restrito. Use o modo "no-cors" em integrações 
                              personalizadas ou confie no histórico do Zap para confirmar o recebimento.
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Exemplos de Código */}
                  <AccordionItem value="code">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" />
                        Exemplos de Código
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        Exemplos de como receber e processar webhooks em diferentes linguagens:
                      </p>

                      {/* Node.js */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          <span className="font-medium">Node.js (Express)</span>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook/optimus', (req, res) => {
  const { event, timestamp, data } = req.body;
  
  console.log('Evento recebido:', event);
  console.log('Dados:', data);
  
  // Processar o evento
  switch (event) {
    case 'contact_created':
      // Novo lead criado
      handleNewContact(data);
      break;
    case 'pipeline_stage_changed':
      // Lead mudou de etapa
      handleStageChange(data);
      break;
    // ... outros eventos
  }
  
  res.status(200).json({ received: true });
});

app.listen(3000);`}</pre>
                        </div>
                      </div>

                      {/* Python */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          <span className="font-medium">Python (Flask)</span>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhook/optimus', methods=['POST'])
def webhook():
    data = request.get_json()
    
    event = data.get('event')
    payload = data.get('data')
    
    print(f"Evento: {event}")
    print(f"Dados: {payload}")
    
    if event == 'contact_created':
        handle_new_contact(payload)
    elif event == 'message_created':
        handle_new_message(payload)
    
    return jsonify({'received': True}), 200

if __name__ == '__main__':
    app.run(port=5000)`}</pre>
                        </div>
                      </div>

                      {/* PHP */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          <span className="font-medium">PHP</span>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`<?php
$payload = file_get_contents('php://input');
$data = json_decode($payload, true);

$event = $data['event'] ?? '';
$eventData = $data['data'] ?? [];

error_log("Evento recebido: " . $event);

switch ($event) {
    case 'contact_created':
        handleNewContact($eventData);
        break;
    case 'campaign_completed':
        handleCampaignComplete($eventData);
        break;
}

http_response_code(200);
echo json_encode(['received' => true]);
?>`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Boas Práticas */}
                  <AccordionItem value="best-practices">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        Boas Práticas
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="grid gap-4">
                        <div className="flex items-start gap-3">
                          <CheckCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">Responda rapidamente (200 OK)</h4>
                            <p className="text-sm text-muted-foreground">
                              Retorne status 200 imediatamente e processe os dados em background. 
                              Timeouts podem causar tentativas duplicadas.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3">
                          <CheckCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">Implemente idempotência</h4>
                            <p className="text-sm text-muted-foreground">
                              Use o timestamp e IDs para evitar processar o mesmo evento duas vezes.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3">
                          <CheckCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">Valide a origem</h4>
                            <p className="text-sm text-muted-foreground">
                              Verifique os headers X-Webhook-ID e User-Agent para garantir autenticidade.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3">
                          <CheckCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">Use HTTPS</h4>
                            <p className="text-sm text-muted-foreground">
                              Sempre utilize endpoints HTTPS para garantir segurança na transmissão.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3">
                          <CheckCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-medium">Registre logs detalhados</h4>
                            <p className="text-sm text-muted-foreground">
                              Mantenha logs de todos os webhooks recebidos para debugging.
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Solução de Problemas */}
                  <AccordionItem value="troubleshooting">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-primary" />
                        Solução de Problemas
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-4">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-destructive">Webhook não está sendo recebido</h4>
                          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                            <li>Verifique se a URL está correta e acessível publicamente</li>
                            <li>Confirme se o webhook está ativo (switch ligado)</li>
                            <li>Verifique se os eventos corretos estão selecionados</li>
                            <li>Use o botão "Testar" para validar a conexão</li>
                          </ul>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-destructive">Erro de CORS</h4>
                          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                            <li>CORS é uma restrição do navegador, não afeta webhooks server-to-server</li>
                            <li>Se usando Zapier, o histórico do Zap mostra os dados recebidos</li>
                            <li>Configure headers CORS no seu servidor se necessário</li>
                          </ul>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-destructive">Dados incompletos</h4>
                          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                            <li>Verifique se o Content-Type está como application/json</li>
                            <li>Confirme o parser JSON no seu servidor</li>
                            <li>Cheque os logs para ver o payload completo</li>
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Integracoes;