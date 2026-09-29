import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useWebChatAnalytics, useWebChatOnline, type WebChatLinkRow, type RadarClick } from "@/hooks/useWebChatAnalytics";
import { toast } from "sonner";
import { Globe, Plus, Copy, ExternalLink, Trash2, MessageCircle, Pencil, MousePointerClick, CheckCircle2, LogOut, Radio, RefreshCw } from "lucide-react";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const publicUrlFor = (l: WebChatLinkRow) => `https://optimuscrm.com.br/c/${l.slug}`;
const previewOrigin = () => {
  const { hostname, origin } = window.location;
  const projectId = hostname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)?.[1];

  if (projectId && hostname.endsWith("lovableproject.com")) {
    return `https://id-preview--${projectId}.lovable.app`;
  }

  return origin;
};
const previewUrlFor = (l: WebChatLinkRow) => `${previewOrigin()}/c/${l.slug}`;

function Kpi({ icon: Icon, label, value, hint, loading, live }: { icon: any; label: string; value: string; hint: string; loading?: boolean; live?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {live ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" /></span> : <Icon className="h-4 w-4" />}
        </div>
        {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function WebChatLinks() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const navigate = useNavigate();
  const [links, setLinks] = useState<WebChatLinkRow[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("Olá! Como podemos ajudar?");
  const [color, setColor] = useState("#005C4B");
  const [prefill, setPrefill] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WebChatLinkRow | null>(null);
  const [editName, setEditName] = useState("");
  const db = supabase as any;

  const load = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    const { data, error } = await db.from("webchat_links").select("*").eq("organization_id", effectiveOrganizationId).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar links de chat");
    setLinks(data || []);
  }, [effectiveOrganizationId]);

  useEffect(() => { load(); }, [load]);

  const { clicks, totals, byChannel, loading, error, reload } = useWebChatAnalytics(effectiveOrganizationId, links);
  const online = useWebChatOnline(links);

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

  const toggle = async (l: WebChatLinkRow) => { await db.from("webchat_links").update({ is_active: !l.is_active }).eq("id", l.id); load(); };

  const remove = async (l: WebChatLinkRow) => {
    if (!confirm(`Excluir o link "${l.name}"? O histórico de conversas é mantido.`)) return;
    await db.from("webchat_links").delete().eq("id", l.id);
    load();
  };

  const saveName = async () => {
    if (!editing || !editName.trim()) return;
    const { error } = await db.from("webchat_links").update({ name: editName.trim() }).eq("id", editing.id);
    if (error) { toast.error("Erro ao renomear"); return; }
    toast.success("Nome atualizado"); setEditing(null); load();
  };

  const openConversation = (c: RadarClick) => {
    const params = new URLSearchParams({ phone: c.phone, channelId: c.channelId });
    navigate(`/atendimento-v2?${params.toString()}`);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Globe className="h-6 w-6 text-primary" /> Web Chat</h1>
            <p className="text-sm text-muted-foreground">Cliques, conversões e abandono dos seus links de chat (últimos 90 dias).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => { load(); reload(); }} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Criar novo link</Button>
          </div>
        </div>

        {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={MousePointerClick} label="Total de cliques" value={totals.total.toLocaleString("pt-BR")} hint="Aberturas pelo Link Mágico" loading={loading} />
          <Kpi icon={CheckCircle2} label="Conversões reais" value={totals.converted.toLocaleString("pt-BR")} hint="Enviaram ao menos 1 mensagem" loading={loading} />
          <Kpi icon={LogOut} label="Taxa de abandono" value={pct(totals.abandonRate)} hint="Abriram e não escreveram" loading={loading} />
          <Kpi icon={Radio} label="Online agora" value={online.toLocaleString("pt-BR")} hint="Com a tela do chat aberta" live />
        </div>

        <Tabs defaultValue="links">
          <TabsList>
            <TabsTrigger value="links">Performance por link</TabsTrigger>
            <TabsTrigger value="radar">Radar de leads</TabsTrigger>
          </TabsList>

          <TabsContent value="links">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Links de Web Chat</CardTitle></CardHeader>
              <CardContent className="p-0">
                {links.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhum link de chat criado ainda.</p> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Link</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">Convertidos</TableHead>
                        <TableHead className="text-right">Conversão</TableHead>
                        <TableHead className="text-center">Ativo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map((l) => {
                        const s = (l.channel_id && byChannel.get(l.channel_id)) || { clicks: 0, converted: 0, rate: 0 };
                        return (
                          <TableRow key={l.id}>
                            <TableCell><div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: l.theme_color }} /><span className="font-medium text-foreground">{l.name}</span></div></TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs">/c/{l.slug}</TableCell>
                            <TableCell className="text-right tabular-nums">{loading ? "…" : s.clicks}</TableCell>
                            <TableCell className="text-right tabular-nums">{loading ? "…" : s.converted}</TableCell>
                            <TableCell className="text-right tabular-nums">{loading ? "…" : s.clicks ? pct(s.rate) : "—"}</TableCell>
                            <TableCell className="text-center"><Switch checked={l.is_active} onCheckedChange={() => toggle(l)} /></TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" title="Copiar link público" onClick={() => { navigator.clipboard.writeText(publicUrlFor(l)); toast.success("Link público copiado"); }}><Copy className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" title="Abrir no preview" onClick={() => window.open(previewUrlFor(l), "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" title="Editar nome" onClick={() => { setEditing(l); setEditName(l.name); }}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" title="Excluir" onClick={() => remove(l)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="radar">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Quem clicou no Link Mágico</CardTitle></CardHeader>
              <CardContent className="p-0">
                {loading && clicks.length === 0 ? (
                  <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : clicks.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">Nenhum clique registrado ainda. Os cliques aparecem quando um cliente abre o link enviado na campanha.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Link acessado</TableHead>
                        <TableHead>Data/hora do clique</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clicks.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <ContactAvatar name={c.leadName} avatarPath={c.avatarPath} organizationId={effectiveOrganizationId} className="h-8 w-8" />
                              <span className="font-medium text-foreground">{c.leadName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.linkName}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{new Date(c.clickedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                          <TableCell>
                            {c.converted
                              ? <Badge variant="outline" className="border-success/40 bg-success/10 text-success">🟢 Em atendimento</Badge>
                              : <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">🔴 Abandono / só visualizou</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => openConversation(c)}><MessageCircle className="h-4 w-4 mr-1" /> Ver conversa</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo link de Web Chat</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome (aparece no topo do chat)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atendimento KS" /></div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} /></div>
            <div><Label>Texto Pré-definido do Cliente</Label><Textarea value={prefill} onChange={(e) => setPrefill(e.target.value)} rows={2} maxLength={1000} placeholder="Ex.: Olá, quero saber mais sobre o Cartão Consignado" /><p className="mt-1 text-xs text-muted-foreground">Fica salvo no link e já aparece escrito na caixa de mensagem do cliente.</p></div>
            <div className="flex items-center gap-3"><Label>Cor</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded border border-input bg-transparent" /></div>
            <Button className="w-full" disabled={!name.trim() || saving} onClick={create}>{saving ? "Criando..." : "Criar link"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar nome do link</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} />
            <p className="text-xs text-muted-foreground">O endereço /c/{editing?.slug} continua o mesmo.</p>
            <Button className="w-full" disabled={!editName.trim()} onClick={saveName}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
