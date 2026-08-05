import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagSelector } from "@/components/leads/TagSelector";
import {
  Plus,
  Copy,
  Trash2,
  Edit,
  Loader2,
  FormInput,
  Send,
  Tag as TagIcon,
  AlertCircle,
} from "lucide-react";

interface InboundWebhook {
  id: string;
  name: string;
  token: string;
  description: string | null;
  is_active: boolean;
  create_lead: boolean;
  auto_dispatch: boolean;
  channel_id: string | null;
  template_id: string | null;
  tags: string[];
  created_at: string;
}

interface ChannelOption {
  id: string;
  name: string;
  phone: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  status: string;
}

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/lead-webhook`;

const emptyForm = {
  name: "",
  description: "",
  create_lead: true,
  auto_dispatch: false,
  channel_id: "",
  template_id: "",
  tags: [] as string[],
};

export function InboundWebhookPanel() {
  const { user } = useAuth();
  const { effectiveOrganizationId: orgId } = useEffectiveOrganizationId();

  const [webhooks, setWebhooks] = useState<InboundWebhook[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InboundWebhook | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const [hooksRes, channelsRes, templatesRes] = await Promise.all([
      supabase
        .from("inbound_webhooks")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("channels")
        .select("id, name, phone")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("message_templates")
        .select("id, name, status")
        .eq("organization_id", orgId)
        .order("name"),
    ]);

    if (hooksRes.error) {
      console.error(hooksRes.error);
      toast.error("Erro ao carregar webhooks de entrada");
    } else {
      setWebhooks((hooksRes.data || []) as InboundWebhook[]);
    }
    setChannels((channelsRes.data || []) as ChannelOption[]);
    setTemplates((templatesRes.data || []) as TemplateOption[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (hook: InboundWebhook) => {
    setEditing(hook);
    setForm({
      name: hook.name,
      description: hook.description || "",
      create_lead: hook.create_lead,
      auto_dispatch: hook.auto_dispatch,
      channel_id: hook.channel_id || "",
      template_id: hook.template_id || "",
      tags: hook.tags || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Informe um nome para o webhook");
      return;
    }
    if (form.auto_dispatch && (!form.channel_id || !form.template_id)) {
      toast.error("Para disparo automático selecione o número e o template");
      return;
    }
    if (!orgId) {
      toast.error("Organização não encontrada");
      return;
    }

    setSaving(true);
    const payload = {
      organization_id: orgId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      create_lead: form.create_lead,
      auto_dispatch: form.auto_dispatch,
      channel_id: form.channel_id || null,
      template_id: form.template_id || null,
      tags: form.tags,
    };

    const { error } = editing
      ? await supabase.from("inbound_webhooks").update(payload).eq("id", editing.id)
      : await supabase.from("inbound_webhooks").insert({ ...payload, created_by: user?.id });

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error("Erro ao salvar webhook");
      return;
    }

    toast.success(editing ? "Webhook atualizado" : "Webhook criado");
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
    fetchAll();
  };

  const handleToggle = async (hook: InboundWebhook) => {
    const { error } = await supabase
      .from("inbound_webhooks")
      .update({ is_active: !hook.is_active })
      .eq("id", hook.id);
    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    setWebhooks((prev) =>
      prev.map((w) => (w.id === hook.id ? { ...w, is_active: !w.is_active } : w))
    );
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("inbound_webhooks").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir webhook");
      return;
    }
    toast.success("Webhook excluído");
    fetchAll();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FormInput className="h-5 w-5" />
                Webhooks de Entrada (Formulários)
              </CardTitle>
              <CardDescription>
                Gere uma URL para receber leads de formulários e landing pages. Você pode apenas
                cadastrar o lead ou também aplicar uma <strong>tag automática</strong> e fazer o{" "}
                <strong>disparo de um template</strong> por um número específico.
              </CardDescription>
            </div>
            <Button onClick={openCreate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Novo webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <FormInput className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Nenhum webhook de entrada configurado</p>
              <p className="text-sm">
                Crie um para capturar leads do formulário do cliente automaticamente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((hook) => {
                const channel = channels.find((c) => c.id === hook.channel_id);
                const template = templates.find((t) => t.id === hook.template_id);
                const publicUrl = `${FUNCTIONS_BASE}/${hook.token}`;
                return (
                  <div key={hook.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{hook.name}</h4>
                          <Badge variant={hook.is_active ? "default" : "secondary"}>
                            {hook.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        {hook.description && (
                          <p className="text-sm text-muted-foreground">{hook.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <code className="truncate rounded bg-muted px-2 py-1 text-xs">
                            {publicUrl}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => copy(publicUrl)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={hook.is_active}
                          onCheckedChange={() => handleToggle(hook)}
                        />
                        <Button size="icon" variant="ghost" onClick={() => openEdit(hook)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir webhook?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A URL deixará de funcionar imediatamente. Esta ação não pode ser
                                desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(hook.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {hook.tags?.length > 0 ? (
                        hook.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="gap-1">
                            <TagIcon className="h-3 w-3" />
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">Sem tag automática</span>
                      )}
                      {hook.auto_dispatch ? (
                        <Badge variant="secondary" className="gap-1">
                          <Send className="h-3 w-3" />
                          {template?.name || "template removido"}
                          {channel ? ` • ${channel.phone || channel.name}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Somente captura de lead</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como usar no formulário do cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Configure o formulário (Typeform, Elementor, N8N, Make, etc.) para enviar um{" "}
            <strong>POST</strong> para a URL do webhook, em JSON ou form-urlencoded.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">{`POST ${FUNCTIONS_BASE}/{token}
Content-Type: application/json

{
  "nome": "João da Silva",
  "telefone": "11999998888",
  "email": "joao@email.com"
}`}</pre>
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Aceitamos os campos <code>phone / telefone / celular / whatsapp</code> e{" "}
            <code>name / nome</code>. Os demais campos ficam salvos no lead.
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar webhook" : "Novo webhook de entrada"}</DialogTitle>
            <DialogDescription>
              Escolha se o webhook só cadastra o lead ou também dispara um template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Formulário Landing Page INSS"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Opcional"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Cadastrar lead automaticamente</Label>
                <p className="text-xs text-muted-foreground">
                  Cria ou atualiza o contato na base de leads
                </p>
              </div>
              <Switch
                checked={form.create_lead}
                onCheckedChange={(v) => setForm((f) => ({ ...f, create_lead: v }))}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Label className="flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                Tags automáticas
              </Label>
              <p className="text-xs text-muted-foreground">
                Todo lead recebido por este webhook receberá estas tags
              </p>
              <TagSelector
                selectedTags={form.tags}
                onTagsChange={(tags) => setForm((f) => ({ ...f, tags }))}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Disparo automático de template
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Envia uma mensagem assim que o lead chegar
                  </p>
                </div>
                <Switch
                  checked={form.auto_dispatch}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, auto_dispatch: v }))}
                />
              </div>

              {form.auto_dispatch && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <Label>Número de disparo *</Label>
                    <Select
                      value={form.channel_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, channel_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o número" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.phone ? `• ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Template *</Label>
                    <Select
                      value={form.template_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, template_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} {t.status === "approved" ? "" : `(${t.status})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Salvar alterações" : "Criar webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
