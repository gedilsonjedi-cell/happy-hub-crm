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
  RefreshCw
} from "lucide-react";

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

  const fetchWebhooks = async () => {
    if (!effectiveOrganizationId?.effectiveOrganizationId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from("webhooks")
      .select("*")
      .eq("organization_id", effectiveOrganizationId.effectiveOrganizationId)
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
  }, [effectiveOrganizationId]);

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
          organization_id: effectiveOrganizationId?.effectiveOrganizationId,
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
          <TabsList>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-2">
              <Zap className="h-4 w-4" />
              Automações
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
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Integracoes;