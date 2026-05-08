import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, AlertCircle, Clock, MessageCircle, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Row {
  assignment_id: string;
  conversation_phone: string;
  channel_id: string | null;
  assigned_to: string | null;
  status: string;
  sector_id: string | null;
  lead_id: string | null;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  sender_name: string | null;
  lead_name: string | null;
  lead_tags: string[] | null;
  assigned_to_name: string | null;
}

interface Channel { id: string; name: string }
interface Sector { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  active: "Em atendimento",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
  archived: "Arquivado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "destructive",
  active: "default",
  in_progress: "default",
  resolved: "secondary",
};

function fmtRel(ts: string | null) {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR });
  } catch { return "—"; }
}

function waitingMinutes(r: Row): number | null {
  // se tem inbound mais recente que mensagem do agente -> está aguardando
  if (!r.last_inbound_at) return null;
  const inbound = new Date(r.last_inbound_at).getTime();
  const last = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;
  // se último inbound == last_message_at, ainda não respondido
  if (inbound >= last) {
    return Math.floor((Date.now() - inbound) / 60000);
  }
  return null;
}

function isFirstContactPending(r: Row): boolean {
  // Sem atendente atribuído + status pending + tem inbound
  return (!r.assigned_to || r.status === "pending") && !!r.last_inbound_at && (waitingMinutes(r) ?? 0) >= 0 && !r.assigned_to;
}

export function AttendanceReportPanel() {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [rows, setRows] = useState<Row[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [tab, setTab] = useState("sem-resposta");

  const load = async () => {
    if (!effectiveOrganizationId) return;
    setLoading(true);
    try {
      const [{ data: ch }, { data: sec }] = await Promise.all([
        (supabase as any).from("channels_public")
          .select("id, name")
          .eq("organization_id", effectiveOrganizationId)
          .in("provider", ["meta", "zapi", "gupshup"]),
        supabase.from("sectors")
          .select("id, name")
          .eq("organization_id", effectiveOrganizationId),
      ]);
      setChannels(ch || []);
      setSectors(sec || []);
      const channelIds = (ch || []).map((c: any) => c.id);
      if (channelIds.length === 0) { setRows([]); setLoading(false); return; }

      const { data, error } = await supabase.rpc("get_conversations_summary", {
        p_channel_ids: channelIds,
        p_organization_id: effectiveOrganizationId,
      });
      if (error) throw error;
      setRows((data as any[])?.map(r => ({ ...r, unread_count: Number(r.unread_count) || 0 })) || []);
    } catch (e) {
      console.error("AttendanceReport load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveOrganizationId]);

  const sectorMap = useMemo(() => new Map(sectors.map(s => [s.id, s.name])), [sectors]);
  const channelMap = useMemo(() => new Map(channels.map(c => [c.id, c.name])), [channels]);

  // Conjunto base filtrado por busca/setor/atendente
  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      if (sectorFilter !== "all" && r.sector_id !== sectorFilter) return false;
      if (agentFilter !== "all") {
        if (agentFilter === "__none__" && r.assigned_to) return false;
        if (agentFilter !== "__none__" && r.assigned_to !== agentFilter) return false;
      }
      if (term) {
        const hay = `${r.lead_name || ""} ${r.sender_name || ""} ${r.conversation_phone}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, sectorFilter, agentFilter]);

  const semResposta = useMemo(() => baseFiltered.filter(r => waitingMinutes(r) !== null), [baseFiltered]);
  const primeiroContato = useMemo(() => baseFiltered.filter(isFirstContactPending), [baseFiltered]);
  const emAtendimento = useMemo(
    () => baseFiltered.filter(r => (r.status === "active" || r.status === "in_progress") && r.assigned_to),
    [baseFiltered]
  );

  // Agrupamentos
  const porAtendente = useMemo(() => {
    const map = new Map<string, { name: string; total: number; semResposta: number; emAtendimento: number; naoLidos: number }>();
    baseFiltered.forEach(r => {
      const key = r.assigned_to || "__sem__";
      const name = r.assigned_to ? (r.assigned_to_name || "Atendente") : "Sem atendente";
      const cur = map.get(key) || { name, total: 0, semResposta: 0, emAtendimento: 0, naoLidos: 0 };
      cur.total++;
      if (waitingMinutes(r) !== null) cur.semResposta++;
      if ((r.status === "active" || r.status === "in_progress") && r.assigned_to) cur.emAtendimento++;
      cur.naoLidos += r.unread_count;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.semResposta - a.semResposta || b.total - a.total);
  }, [baseFiltered]);

  const porSetor = useMemo(() => {
    const map = new Map<string, { name: string; total: number; semResposta: number; emAtendimento: number; naoLidos: number }>();
    baseFiltered.forEach(r => {
      const key = r.sector_id || "__sem__";
      const name = r.sector_id ? (sectorMap.get(r.sector_id) || "Setor") : "Sem setor";
      const cur = map.get(key) || { name, total: 0, semResposta: 0, emAtendimento: 0, naoLidos: 0 };
      cur.total++;
      if (waitingMinutes(r) !== null) cur.semResposta++;
      if ((r.status === "active" || r.status === "in_progress") && r.assigned_to) cur.emAtendimento++;
      cur.naoLidos += r.unread_count;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.semResposta - a.semResposta || b.total - a.total);
  }, [baseFiltered, sectorMap]);

  // Agentes únicos para filtro
  const agentOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.assigned_to) m.set(r.assigned_to, r.assigned_to_name || "Atendente"); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const totalNaoLidos = baseFiltered.reduce((s, r) => s + r.unread_count, 0);

  const renderTable = (data: Row[]) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Atendente</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Não lidas</TableHead>
            <TableHead>Aguardando há</TableHead>
            <TableHead>Última msg</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum atendimento encontrado</TableCell></TableRow>
          ) : data.map(r => {
            const wait = waitingMinutes(r);
            return (
              <TableRow key={r.assignment_id}>
                <TableCell>
                  <div className="font-medium">{r.lead_name || r.sender_name || "Sem nome"}</div>
                  <div className="text-xs text-muted-foreground">{r.conversation_phone}</div>
                </TableCell>
                <TableCell>{r.assigned_to_name || <span className="text-muted-foreground italic">— Sem atendente</span>}</TableCell>
                <TableCell>{r.sector_id ? sectorMap.get(r.sector_id) || "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs">{r.channel_id ? channelMap.get(r.channel_id) || "—" : "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] || "outline"}>{STATUS_LABEL[r.status] || r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {r.unread_count > 0
                    ? <Badge variant="destructive">{r.unread_count}</Badge>
                    : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell>
                  {wait !== null ? (
                    <span className={wait >= 30 ? "text-destructive font-semibold" : wait >= 10 ? "text-orange-600 font-medium" : ""}>
                      {wait < 60 ? `${wait}m` : `${Math.floor(wait/60)}h ${wait%60}m`}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRel(r.last_message_at)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><MessageCircle className="w-4 h-4" />Total ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{baseFiltered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive"><AlertCircle className="w-4 h-4" />Sem resposta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{semResposta.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4" />1º contato pendente</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{primeiroContato.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" />Mensagens não lidas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalNaoLidos}</div></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Setor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Atendente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os atendentes</SelectItem>
            <SelectItem value="__none__">Sem atendente</SelectItem>
            {agentOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="w-4 h-4 mr-2" />Atualizar</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sem-resposta">Sem resposta ({semResposta.length})</TabsTrigger>
          <TabsTrigger value="primeiro-contato">1º contato ({primeiroContato.length})</TabsTrigger>
          <TabsTrigger value="em-atendimento">Em atendimento ({emAtendimento.length})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({baseFiltered.length})</TabsTrigger>
          <TabsTrigger value="por-atendente">Por atendente</TabsTrigger>
          <TabsTrigger value="por-setor">Por setor</TabsTrigger>
        </TabsList>

        <TabsContent value="sem-resposta" className="mt-4">{renderTable(semResposta)}</TabsContent>
        <TabsContent value="primeiro-contato" className="mt-4">{renderTable(primeiroContato)}</TabsContent>
        <TabsContent value="em-atendimento" className="mt-4">{renderTable(emAtendimento)}</TabsContent>
        <TabsContent value="todos" className="mt-4">{renderTable(baseFiltered)}</TabsContent>

        <TabsContent value="por-atendente" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Atendente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Em atendimento</TableHead>
                <TableHead className="text-right">Sem resposta</TableHead>
                <TableHead className="text-right">Não lidas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {porAtendente.map(a => (
                  <TableRow key={a.name}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-right">{a.total}</TableCell>
                    <TableCell className="text-right">{a.emAtendimento}</TableCell>
                    <TableCell className="text-right">{a.semResposta > 0 ? <Badge variant="destructive">{a.semResposta}</Badge> : 0}</TableCell>
                    <TableCell className="text-right">{a.naoLidos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="por-setor" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Em atendimento</TableHead>
                <TableHead className="text-right">Sem resposta</TableHead>
                <TableHead className="text-right">Não lidas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {porSetor.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.total}</TableCell>
                    <TableCell className="text-right">{s.emAtendimento}</TableCell>
                    <TableCell className="text-right">{s.semResposta > 0 ? <Badge variant="destructive">{s.semResposta}</Badge> : 0}</TableCell>
                    <TableCell className="text-right">{s.naoLidos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
