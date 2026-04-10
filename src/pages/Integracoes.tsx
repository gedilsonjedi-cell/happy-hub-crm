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
      const { data: result, error } = await supabase.functions.invoke("webhook-dispatcher", {
        body: {
          organization_id: orgId,
          event: "test",
          data: {
            message: "Este é um teste de webhook do Optimus CRM",
            webhook_name: webhook.name,
          },
          test_webhook_id: webhook.id,
        },
      });

      if (error) {
        toast.error("Erro ao testar webhook: " + error.message);
        return;
      }

      const webhookResult = result?.results?.[0];
      if (webhookResult?.success) {
        toast.success(`Webhook testado com sucesso! Status: ${webhookResult.status}`);
      } else {
        const errorDetail = webhookResult?.error || `Status: ${webhookResult?.status || 'desconhecido'}`;
        toast.error(`Falha no teste: ${errorDetail}`);
      }
    } catch (error) {
      toast.error("Erro ao testar webhook. Verifique a URL.");
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

          <TabsContent value="docs" className="space-y-6">
            {/* ── Autenticação ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  API REST — Documentação Completa
                </CardTitle>
                <CardDescription>
                  Integre o Optimus CRM com qualquer plataforma externa (n8n, Make, Zapier, sistemas próprios)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Base URL */}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Base URL</h3>
                  <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg">
                    <code className="text-sm font-mono">https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1</code>
                  </div>
                </div>

                {/* Autenticação */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">🔐 Autenticação</h3>
                  <p className="text-muted-foreground">
                    Todas as requisições da API utilizam autenticação via <strong>Bearer Token</strong>. 
                    O token é o <code className="bg-muted px-1.5 py-0.5 rounded text-xs">api_token</code> gerado 
                    para cada canal WhatsApp na página de <strong>Canais</strong>.
                  </p>
                  <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                    <pre className="text-sm font-mono">{`Authorization: Bearer SEU_API_TOKEN`}</pre>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="font-medium text-amber-700 dark:text-amber-400">Importante sobre o Token</h4>
                        <p className="text-sm text-muted-foreground">
                          O <code className="bg-muted px-1 py-0.5 rounded text-xs">api_token</code> é gerado automaticamente ao criar o canal e <strong>permanece fixo</strong>. 
                          Ele <strong>NÃO muda</strong> sozinho. Só será alterado se você clicar em "Regenerar Token" na página de Canais 
                          ou se o canal for excluído e recriado (nesse caso, um novo token é gerado).
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Se o seu token parou de funcionar, verifique se o canal ainda está <strong>ativo/conectado</strong> e se não foi recriado.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Onde encontrar o token:</h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Acesse a página <strong>Canais</strong> no menu lateral</li>
                      <li>Clique no canal desejado para abrir as configurações</li>
                      <li>O <strong>API Token</strong> estará exibido na seção de integração</li>
                      <li>Clique no ícone de copiar para usar nas suas integrações</li>
                    </ol>
                  </div>
                </div>

                {/* Cabeçalhos padrão */}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Cabeçalhos Padrão</h3>
                  <p className="text-sm text-muted-foreground">Inclua estes headers em todas as requisições:</p>
                  <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                    <pre className="text-sm font-mono">{`Content-Type: application/json
Authorization: Bearer SEU_API_TOKEN`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Endpoint: Envio de Mensagens ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📨 Envio de Mensagens</CardTitle>
                <CardDescription>Enviar mensagens de texto e áudio via WhatsApp</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="send-text">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600 text-white hover:bg-green-600">POST</Badge>
                        <code className="text-sm font-mono">/send-whatsapp</code>
                        <span className="text-sm text-muted-foreground">— Enviar mensagem de texto ou áudio</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">
                        Envia uma mensagem de texto ou áudio para um número de telefone via WhatsApp. 
                        O sistema identifica automaticamente o provedor (Meta, Z-API, Gupshup, Infobip) pelo canal vinculado ao token.
                      </p>

                      <div>
                        <h4 className="font-medium mb-2">Request Body:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "to": "5511999999999",
  "message": "Olá! Como posso ajudar?"
}`}</pre>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium">Parâmetros:</h4>
                        <div className="grid gap-2">
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">to</code>
                            <span className="text-destructive text-xs mt-0.5">obrigatório</span>
                            <span className="text-muted-foreground">Número do destinatário com DDI+DDD (ex: 5511999999999)</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">message</code>
                            <span className="text-amber-500 text-xs mt-0.5">condicional</span>
                            <span className="text-muted-foreground">Texto da mensagem (obrigatório se não enviar áudio)</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">audioUrl</code>
                            <span className="text-amber-500 text-xs mt-0.5">condicional</span>
                            <span className="text-muted-foreground">URL pública de arquivo de áudio (formato OGG/MP3)</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">audioBase64</code>
                            <span className="text-amber-500 text-xs mt-0.5">condicional</span>
                            <span className="text-muted-foreground">Áudio codificado em Base64 (alternativa ao audioUrl)</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X POST "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/send-whatsapp" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "5511999999999", "message": "Olá!"}'`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo com áudio:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X POST "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/send-whatsapp" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "5511999999999", "audioUrl": "https://exemplo.com/audio.ogg"}'`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response (sucesso):</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "success": true,
  "messageId": "wamid.xxxxx",
  "provider": "meta"
}`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response (erro):</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "error": "Invalid API token or channel not connected"
}`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* ── Endpoint: Gestão de Contatos ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">👤 Gestão de Contatos (Leads)</CardTitle>
                <CardDescription>CRUD completo de contatos/leads da organização</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {/* GET list contacts */}
                  <AccordionItem value="contacts-list">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-600 text-white hover:bg-blue-600">GET</Badge>
                        <code className="text-sm font-mono">/manage-contacts</code>
                        <span className="text-sm text-muted-foreground">— Listar contatos</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">
                        Retorna a lista de contatos da organização com suporte a busca, filtro por etapa do pipeline e paginação.
                      </p>

                      <div className="space-y-2">
                        <h4 className="font-medium">Query Parameters:</h4>
                        <div className="grid gap-2">
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">search</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Busca por nome, telefone ou email</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">stage</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Filtrar por nome da etapa do pipeline</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">contact_id</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">ID do contato para buscar um específico</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">page</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Página (padrão: 1)</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">limit</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Itens por página (padrão: 20, máx: 100)</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X GET "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-contacts?search=joao&page=1&limit=20" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json"`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`{
  "data": [
    {
      "id": "uuid-do-contato",
      "name": "João Silva",
      "phone": "5511999999999",
      "email": "joao@email.com",
      "status": "active",
      "tags": ["cliente", "vip"],
      "notes": "Cliente premium",
      "stage": "Em Negociação",
      "created_at": "2026-01-15T14:30:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* POST create contact */}
                  <AccordionItem value="contacts-create">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600 text-white hover:bg-green-600">POST</Badge>
                        <code className="text-sm font-mono">/manage-contacts</code>
                        <span className="text-sm text-muted-foreground">— Criar contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Request Body:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "name": "João Silva",
  "phone": "5511999999999",
  "email": "joao@email.com",
  "tags": ["interessado", "site"],
  "notes": "Veio pelo site",
  "stage": "Novo Lead"
}`}</pre>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium">Parâmetros:</h4>
                        <div className="grid gap-2">
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">name</code>
                            <span className="text-destructive text-xs mt-0.5">obrigatório</span>
                            <span className="text-muted-foreground">Nome do contato</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">phone</code>
                            <span className="text-destructive text-xs mt-0.5">obrigatório</span>
                            <span className="text-muted-foreground">Telefone com DDI+DDD</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">email</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Email do contato</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">tags</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Array de tags/etiquetas</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">notes</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Observações sobre o contato</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <code className="bg-muted px-2 py-0.5 rounded whitespace-nowrap">stage</code>
                            <span className="text-green-500 text-xs mt-0.5">opcional</span>
                            <span className="text-muted-foreground">Nome da etapa do pipeline (ex: "Novo Lead")</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X POST "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-contacts" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "João Silva", "phone": "5511999999999", "email": "joao@email.com"}'`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response (201):</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "data": {
    "id": "uuid-gerado",
    "name": "João Silva",
    "phone": "5511999999999",
    "email": "joao@email.com",
    "tags": null,
    "notes": null,
    "stage": "Novo Lead",
    "created_at": "2026-04-10T12:00:00.000Z"
  }
}`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* PUT update contact */}
                  <AccordionItem value="contacts-update">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-600 text-white hover:bg-amber-600">PUT</Badge>
                        <code className="text-sm font-mono">/manage-contacts?contact_id=UUID</code>
                        <span className="text-sm text-muted-foreground">— Atualizar contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">
                        Atualiza campos de um contato existente. Envie apenas os campos que deseja alterar.
                      </p>

                      <div>
                        <h4 className="font-medium mb-2">Request Body:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "name": "João Silva Santos",
  "email": "joao.santos@email.com",
  "tags": ["cliente", "premium"],
  "stage": "Em Negociação"
}`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X PUT "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-contacts?contact_id=UUID_DO_CONTATO" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "João Atualizado", "stage": "Fechado"}'`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* DELETE contact */}
                  <AccordionItem value="contacts-delete">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-600 text-white hover:bg-red-600">DELETE</Badge>
                        <code className="text-sm font-mono">/manage-contacts?contact_id=UUID</code>
                        <span className="text-sm text-muted-foreground">— Excluir contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X DELETE "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-contacts?contact_id=UUID_DO_CONTATO" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json"`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response (200):</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{ "success": true }`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* ── Endpoint: Gestão de Etiquetas ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🏷️ Gestão de Etiquetas (Tags)</CardTitle>
                <CardDescription>Criar, listar, atribuir e remover etiquetas de contatos</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {/* GET labels */}
                  <AccordionItem value="labels-list">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-600 text-white hover:bg-blue-600">GET</Badge>
                        <code className="text-sm font-mono">/manage-labels</code>
                        <span className="text-sm text-muted-foreground">— Listar etiquetas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X GET "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-labels" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json"`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "data": [
    { "id": "uuid", "name": "VIP", "color": "#6366f1" },
    { "id": "uuid", "name": "Interessado", "color": "#10b981" }
  ]
}`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* POST create label */}
                  <AccordionItem value="labels-create">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600 text-white hover:bg-green-600">POST</Badge>
                        <code className="text-sm font-mono">/manage-labels</code>
                        <span className="text-sm text-muted-foreground">— Criar etiqueta</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Request Body:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "name": "Premium",
  "color": "#f59e0b"
}`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X POST "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-labels" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Premium", "color": "#f59e0b"}'`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* POST assign labels to contact */}
                  <AccordionItem value="labels-assign">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600 text-white hover:bg-green-600">POST</Badge>
                        <code className="text-sm font-mono">/manage-labels</code>
                        <span className="text-sm text-muted-foreground">— Atribuir etiquetas a um contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Request Body:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{
  "contact_id": "UUID_DO_CONTATO",
  "tags": ["VIP", "Premium"]
}`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X POST "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-labels" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"contact_id": "UUID_DO_CONTATO", "tags": ["VIP", "Premium"]}'`}</pre>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-sm font-mono">{`{ "success": true, "tags": ["cliente", "VIP", "Premium"] }`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* DELETE label from contact */}
                  <AccordionItem value="labels-remove">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-600 text-white hover:bg-red-600">DELETE</Badge>
                        <code className="text-sm font-mono">/manage-labels?contact_id=UUID&tag=NOME</code>
                        <span className="text-sm text-muted-foreground">— Remover etiqueta de contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X DELETE "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-labels?contact_id=UUID&tag=VIP" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json"`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* DELETE label entirely */}
                  <AccordionItem value="labels-delete">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-600 text-white hover:bg-red-600">DELETE</Badge>
                        <code className="text-sm font-mono">/manage-labels?label_id=UUID</code>
                        <span className="text-sm text-muted-foreground">— Excluir etiqueta permanentemente</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div>
                        <h4 className="font-medium mb-2">Exemplo cURL:</h4>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`curl -X DELETE "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/manage-labels?label_id=UUID_DA_ETIQUETA" \\
  -H "Authorization: Bearer SEU_API_TOKEN" \\
  -H "Content-Type: application/json"`}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* ── Webhooks (outbound) ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🔔 Webhooks (Notificações de Saída)</CardTitle>
                <CardDescription>
                  Receba notificações em tempo real quando eventos ocorrem no CRM. Configure na aba "Webhooks".
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="webhook-payload">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-primary" />
                        Estrutura do Payload
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">
                        Todas as notificações são enviadas como <strong>POST</strong> para a URL configurada com <code className="bg-muted px-1 py-0.5 rounded text-xs">Content-Type: application/json</code>.
                      </p>
                      <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                        <pre className="text-sm font-mono">{`{
  "event": "contact_created",
  "timestamp": "2026-01-15T14:30:00.000Z",
  "organization_id": "uuid-da-organizacao",
  "data": {
    // Dados específicos do evento
  }
}`}</pre>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="webhook-events">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Eventos Disponíveis
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-3">
                        {WEBHOOK_EVENTS.map(evt => (
                          <div key={evt.id} className="flex items-start gap-2 text-sm">
                            <Badge variant="outline" className="shrink-0">{evt.id}</Badge>
                            <span className="text-muted-foreground">{evt.description}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* ── Códigos HTTP ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📋 Códigos de Resposta HTTP</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-green-600 text-white hover:bg-green-600 w-12 justify-center">200</Badge>
                    <span className="text-muted-foreground">Requisição bem-sucedida</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-green-600 text-white hover:bg-green-600 w-12 justify-center">201</Badge>
                    <span className="text-muted-foreground">Recurso criado com sucesso</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-amber-600 text-white hover:bg-amber-600 w-12 justify-center">400</Badge>
                    <span className="text-muted-foreground">Parâmetros inválidos ou ausentes</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-red-600 text-white hover:bg-red-600 w-12 justify-center">401</Badge>
                    <span className="text-muted-foreground">Token inválido ou ausente</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-red-600 text-white hover:bg-red-600 w-12 justify-center">404</Badge>
                    <span className="text-muted-foreground">Recurso não encontrado</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-red-600 text-white hover:bg-red-600 w-12 justify-center">405</Badge>
                    <span className="text-muted-foreground">Método HTTP não permitido</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge className="bg-red-800 text-white hover:bg-red-800 w-12 justify-center">500</Badge>
                    <span className="text-muted-foreground">Erro interno do servidor</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Exemplos de integração ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🔧 Exemplos de Integração</CardTitle>
                <CardDescription>Como usar a API em diferentes plataformas</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="n8n-example">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-orange-500 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-white">n8n</span>
                        </div>
                        Integração com N8N
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <h4 className="font-medium">Adicione o nó HTTP Request</h4>
                            <p className="text-sm text-muted-foreground">Configure o método (GET/POST/PUT/DELETE) e a URL completa do endpoint</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <h4 className="font-medium">Configure a autenticação</h4>
                            <p className="text-sm text-muted-foreground">Em "Authentication" selecione "Generic Credential Type" → "Header Auth" com Header Name: <code className="bg-muted px-1 rounded text-xs">Authorization</code> e Value: <code className="bg-muted px-1 rounded text-xs">Bearer SEU_API_TOKEN</code></p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <h4 className="font-medium">Configure o Body (para POST/PUT)</h4>
                            <p className="text-sm text-muted-foreground">Selecione "JSON" e adicione os campos conforme a documentação do endpoint</p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="code-examples">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" />
                        Exemplos de Código
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          <span className="font-medium">JavaScript / Node.js</span>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`const API_URL = "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1";
const API_TOKEN = "SEU_API_TOKEN";

// Enviar mensagem
const enviarMensagem = async (telefone, texto) => {
  const res = await fetch(\`\${API_URL}/send-whatsapp\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: telefone, message: texto }),
  });
  return res.json();
};

// Listar contatos
const listarContatos = async (pagina = 1) => {
  const res = await fetch(\`\${API_URL}/manage-contacts?page=\${pagina}\`, {
    headers: {
      "Authorization": \`Bearer \${API_TOKEN}\`,
      "Content-Type": "application/json",
    },
  });
  return res.json();
};

// Criar contato
const criarContato = async (nome, telefone) => {
  const res = await fetch(\`\${API_URL}/manage-contacts\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: nome, phone: telefone }),
  });
  return res.json();
};`}</pre>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          <span className="font-medium">Python</span>
                        </div>
                        <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">{`import requests

API_URL = "https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1"
API_TOKEN = "SEU_API_TOKEN"
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

# Enviar mensagem
def enviar_mensagem(telefone, texto):
    resp = requests.post(
        f"{API_URL}/send-whatsapp",
        headers=HEADERS,
        json={"to": telefone, "message": texto},
    )
    return resp.json()

# Listar contatos
def listar_contatos(pagina=1):
    resp = requests.get(
        f"{API_URL}/manage-contacts",
        headers=HEADERS,
        params={"page": pagina},
    )
    return resp.json()

# Criar contato
def criar_contato(nome, telefone):
    resp = requests.post(
        f"{API_URL}/manage-contacts",
        headers=HEADERS,
        json={"name": nome, "phone": telefone},
    )
    return resp.json()`}</pre>
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