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

interface WebChatLink { id: string; name: string; greeting_message: string | null; theme_color: string; is_active: boolean; channel_id: string | null; }

export default function WebChatLinks() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [links, setLinks] = useState<WebChatLink[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("Olá! Como podemos ajudar?");
  const [color, setColor] = useState("#3385FF");
  const [saving, setSaving] = useState(false);
  const db = supabase as any;

  const load = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    const { data, error } = await db.from("webchat_links").select("*").eq("organization_id", effectiveOrganizationId).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar links de chat");
    setLinks(data || []);
  }, [effectiveOrganizationId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !effectiveOrganizationId || !user) return;
    setSaving(true);
    const { data: link, error } = await db.from("webchat_links").insert({
      organization_id: effectiveOrganizationId, name: name.trim(), greeting_message: greeting.trim() || null, theme_color: color,
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
    setOpen(false); setName("");
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

  const urlFor = (id: string) => `${window.location.origin}/chat/${id}`;

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
                  <p className="text-xs text-muted-foreground truncate">{urlFor(l.id)}</p>
                </div>
                <Switch checked={l.is_active} onCheckedChange={() => toggle(l)} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(urlFor(l.id)); toast.success("Link copiado"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => window.open(urlFor(l.id), "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => remove(l)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo link de Web Chat</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome (aparece no topo do chat)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atendimento KS" /></div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} /></div>
            <div className="flex items-center gap-3"><Label>Cor</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded border border-input bg-transparent" /></div>
            <Button className="w-full" disabled={!name.trim() || saving} onClick={create}>{saving ? "Criando..." : "Criar link"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
