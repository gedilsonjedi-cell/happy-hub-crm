import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getExternalClient } from "@/lib/externalSupabaseClient";

export interface WebChatLinkRow {
  id: string; slug: string; name: string; greeting_message: string | null; theme_color: string;
  is_active: boolean; channel_id: string | null; prefill_text?: string | null; avatar_path?: string | null;
}

export interface RadarClick {
  id: string;
  leadId: string | null;
  leadName: string;
  avatarPath: string | null;
  phone: string; // webchat:<session>
  channelId: string;
  linkName: string;
  clickedAt: string;
  converted: boolean;
}

export interface LinkStats { clicks: number; converted: number; rate: number }

interface RawMsg { id: string; channel_id: string; sender_phone: string; message_type: string; direction: string; created_at: string; metadata: any }

const DAYS = 90;
const TIMEOUT_MS = 12000;

/**
 * Clique = log "system_log" do Radar de Abandono.
 * Conversão = mensagem inbound normal da mesma sessão/canal DEPOIS do log.
 */
export function useWebChatAnalytics(orgId: string | null | undefined, links: WebChatLinkRow[]) {
  const [clicks, setClicks] = useState<RadarClick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelKey = links.map((l) => l.channel_id).filter(Boolean).sort().join(",");

  const load = useCallback(async () => {
    const channelIds = channelKey ? channelKey.split(",") : [];
    if (!orgId || channelIds.length === 0) { setClicks([]); return; }
    setLoading(true); setError(null);
    try {
      const ext = await getExternalClient(orgId);
      const since = new Date(Date.now() - DAYS * 864e5).toISOString();
      const all: RawMsg[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const q = ext.from("whatsapp_messages")
          .select("id, channel_id, sender_phone, message_type, direction, created_at, metadata")
          .in("channel_id", channelIds).eq("direction", "inbound").like("sender_phone", "webchat:%")
          .gte("created_at", since).order("created_at", { ascending: true }).range(from, from + 999);
        const res: any = await Promise.race([q, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
        if (res.error) throw res.error;
        all.push(...(res.data || []));
        if (!res.data || res.data.length < 1000) break;
      }

      const lastInbound = new Map<string, string>(); // sessão → última msg normal
      for (const m of all) if (m.message_type !== "system_log") {
        const k = `${m.channel_id}|${m.sender_phone}`;
        if (!lastInbound.has(k) || lastInbound.get(k)! < m.created_at) lastInbound.set(k, m.created_at);
      }
      const logs = all.filter((m) => m.message_type === "system_log");
      const leadIds = [...new Set(logs.map((l) => l.metadata?.lead_id).filter(Boolean))] as string[];
      const leadMap = new Map<string, { name: string; avatar_path: string | null }>();
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data } = await (supabase as any).from("leads").select("id, name, avatar_path").in("id", leadIds.slice(i, i + 200));
        (data || []).forEach((l: any) => leadMap.set(l.id, l));
      }
      const linkByChannel = new Map(links.map((l) => [l.channel_id, l.name]));
      setClicks(logs.reverse().map((l) => {
        const leadId = l.metadata?.lead_id ?? null;
        const lead = leadId ? leadMap.get(leadId) : undefined;
        const last = lastInbound.get(`${l.channel_id}|${l.sender_phone}`);
        return {
          id: l.id, leadId, leadName: lead?.name || "Contato",
          avatarPath: lead?.avatar_path ?? null, phone: l.sender_phone, channelId: l.channel_id,
          linkName: linkByChannel.get(l.channel_id) || "—", clickedAt: l.created_at,
          converted: !!last && last > l.created_at,
        };
      }));
    } catch (e: any) {
      setError(e?.message === "timeout" ? "Tempo esgotado ao carregar as métricas" : "Erro ao carregar as métricas");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, channelKey]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const total = clicks.length;
    const converted = clicks.filter((c) => c.converted).length;
    return { total, converted, abandonRate: total ? ((total - converted) / total) * 100 : 0 };
  }, [clicks]);

  const byChannel = useMemo(() => {
    const m = new Map<string, LinkStats>();
    for (const c of clicks) {
      const s = m.get(c.channelId) || { clicks: 0, converted: 0, rate: 0 };
      s.clicks++; if (c.converted) s.converted++;
      s.rate = (s.converted / s.clicks) * 100;
      m.set(c.channelId, s);
    }
    return m;
  }, [clicks]);

  return { clicks, totals, byChannel, loading, error, reload: load };
}

/** Sessões com a tela do chat aberta agora (Supabase Presence, um tópico por link). */
export function useWebChatOnline(links: WebChatLinkRow[]) {
  const [count, setCount] = useState(0);
  const key = links.map((l) => `${l.id}:${l.slug}`).join(",");
  useEffect(() => {
    if (!key) { setCount(0); return; }
    const counts = new Map<string, number>();
    const topics = key.split(",").flatMap((k) => k.split(":")).filter(Boolean);
    const chans = topics.map((t) => {
      const ch = supabase.channel(`webchat-presence:${t}`);
      ch.on("presence", { event: "sync" }, () => {
        counts.set(t, Object.keys(ch.presenceState()).length);
        setCount([...counts.values()].reduce((a, b) => a + b, 0));
      }).subscribe();
      return ch;
    });
    return () => { chans.forEach((c) => supabase.removeChannel(c)); };
  }, [key]);
  return count;
}
