import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { Globe, Plus, Copy, ExternalLink, Trash2, MessageCircle, Users } from "lucide-react";

interface WebChatLink { id: string; slug: string; name: string; greeting_message: string | null; theme_color: string; is_active: boolean; channel_id: string | null; prefill_text?: string | null; }

interface WebChatVisitor {
  id: string;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  channel_id: string | null;
}

const visitorStatusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-primary/10 text-primary border-primary/30" },
  contacted: { label: "Contatado", className: "bg-warning/10 text-warning border-warning/30" },
  qualified: { label: "Qualificado", className: "bg-blue-500/10 text-blue-400 border-blue-400/30" },
  converted: { label: "Convertido", className: "bg-primary/10 text-primary border-primary/30" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground border-border" },
};

export default function WebChatLinks() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const navigate = useNavigate();
  const [links, setLinks] = useState<WebChatLink[]>([]);
  const [visitors, setVisitors] = useState<WebChatVisitor[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("Olá! Como podemos ajudar?");
  const [color, setColor] = useState("#005C4B");
  const [prefill, setPrefill] = useState("");
  const [saving, setSaving] = useState(false);
  const db = supabase as any;

  const load = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    const { data, error } = await db.from("webchat_links").select("*").eq("organization_id", effectiveOrganizationId).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar links de chat");
    setLinks(data || []);

    // Visitantes: leads criados pelo Web Chat (phone = webchat:<sessionId>)
    const { data: visitorLeads } = await db
      .from("leads")
      .select("id, name, phone, bsuid, status, created_at")
      .eq("organization_id", effectiveOrganizationId)
      .or("phone.ilike.webchat:%,tags.cs.{web_chat}")
      .order("created_at", { ascending: false })
      .limit(200);

    // Visitantes anônimos não têm telefone: a sessão fica em bsuid.
    const rows = ((visitorLeads || []) as Array<Omit<WebChatVisitor, "channel_id"> & { bsuid?: string | null }>)
      .map(({ bsuid, ...v }) => ({ ...v, phone: v.phone || (bsuid ? `webchat:${bsuid}` : "") }))
      .filter((v) => v.phone.startsWith("webchat:"));
    if (rows.length > 0) {
      // Relaciona cada visitante ao canal (e ao link de origem) via conversation_assignments
      const { data: assignments } = await db
        .from("conversation_assignments")
        .select("lead_id, channel_id")
        .eq("organization_id", effectiveOrganizationId)
        .in("lead_id", rows.map((r) => r.id));
      const channelByLead = new Map<string, string>();
      (assignments || []).forEach((a: any) => {
        if (a.lead_id && a.channel_id && !channelByLead.has(a.lead_id)) channelByLead.set(a.lead_id, a.channel_id);
      });
      setVisitors(rows.map((r) => ({ ...r, channel_id: channelByLead.get(r.id) ?? null })));
    } else {
      setVisitors([]);
    }
  }, [effectiveOrganizationId]);

  useEffect(() => { load(); }, [load]);

  const linkNameByChannel = new Map(links.filter((l) => l.channel_id).map((l) => [l.channel_id as string, l.name]));

  const openConversation = (v: WebChatVisitor) => {
    const params = new URLSearchParams({ phone: v.phone });
    if (v.channel_id) params.set("channelId", v.channel_id);
    navigate(`/atendimento-v2?${params.toString()}`);
  };

  const create = async () => {
    if (!name.trim() || !effectiveOrganizationId || !user) return;
    setSaving(true);
    const { data: link, error } = await db.from("webchat_links").insert({
      organization_id: effectiveOrganizationId, name: name.trim(), greeting_message: greeting.trim() || null, theme_color: color, prefill_text: prefill.trim() || null,
    }).select("id").single();
    if (!error && link) {
      const { data: ch } = await db.from("channels").insert({
        user_id: user.id, organization_id: effectiveOrganizationId, name: name.trim(),
        phone: `webchat:${link.id}`, provider: "web_chat", connected: true,
      }).select("id").single();
      if (ch) await db.from("webchat_links").update({ channel_id: ch.id }).eq("id", link.id);
    }
    setSaving(false);
    if (error) { toast.error("Erro ao criar link: " + error.message); return; }
    toast.success("Link de chat criado");
    setOpen(false); setName(""); setPrefill("");
    load();
  };

  const toggle = async (l: WebChatLink) => {
    await db.from("webchat_links").update({ is_active: !l.is_active }).eq("id", l.id);
    load();
  };

  const remove = async (l: WebChatLink) => {
    if (!confirm(`Excluir o link "${l.name}"? O histórico de conversas é mantido.`)) return;
    await db.from("webchat_links").delete().eq("id", l.id);
    load();
  };

  // Link sempre limpo: o texto pré-definido mora no próprio link (coluna prefill_text)
  // e é aplicado pelo chat ao abrir — nunca vai na URL.
  const urlFor = (l: WebChatLink) => `https://optimuscrm.com.br/c/${l.slug}`;

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Globe className="h-6 w-6 text-primary" /> Web Chat</h1>
            <p className="text-sm text-muted-foreground">Links públicos de chat — as conversas chegam no Atendimento, sem custo por mensagem.</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo link</Button>
        </div>

        {links.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum link de chat criado ainda.</CardContent></Card>}

        <div className="grid gap-3">
          {links.map((l) => (
            <Card key={l.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="h-10 w-10 rounded-full shrink-0" style={{ backgroundColor: l.theme_color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{urlFor(l)}</p>
                </div>
                <Switch checked={l.is_active} onCheckedChange={() => toggle(l)} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(urlFor(l)); toast.success("Link copiado"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => window.open(urlFor(l), "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => remove(l)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="pt-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Visitantes</h2>
            <p className="text-sm text-muted-foreground">Pessoas que iniciaram conversa pelos links de chat.</p>
          </div>

          {visitors.length === 0 && (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum visitante ainda.</CardContent></Card>
          )}

          <div className="grid gap-2">
            {visitors.map((v) => {
              const sessionShort = v.phone.replace("webchat:", "").slice(0, 8);
              const displayName = v.name && !v.name.startsWith("Visitante Web")
                ? v.name
                : `Visitante ${sessionShort}`;
              const statusCfg = visitorStatusConfig[v.status || "new"] || visitorStatusConfig.new;
              const origin = v.channel_id ? linkNameByChannel.get(v.channel_id) : undefined;
              return (
                <Card key={v.id}>
                  <CardContent className="p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {origin ? `Origem: ${origin} · ` : ""}{new Date(v.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${statusCfg.className}`}>{statusCfg.label}</span>
                    <Button variant="outline" size="sm" onClick={() => openConversation(v)}>
                      <MessageCircle className="h-4 w-4 mr-1" /> Abrir conversa
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo link de Web Chat</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome (aparece no topo do chat)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atendimento KS" /></div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} /></div>
            <div><Label>Texto Pré-definido do Cliente</Label><Textarea value={prefill} onChange={(e) => setPrefill(e.target.value)} rows={2} maxLength={1000} placeholder="Ex.: Olá, quero saber mais sobre o Cartão Consignado" /><p className="mt-1 text-xs text-muted-foreground">Fica salvo no link e já aparece escrito na caixa de mensagem do cliente. O link continua curto e limpo.</p></div>
            <div className="flex items-center gap-3"><Label>Cor</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded border border-input bg-transparent" /></div>
            <Button className="w-full" disabled={!name.trim() || saving} onClick={create}>{saving ? "Criando..." : "Criar link"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
