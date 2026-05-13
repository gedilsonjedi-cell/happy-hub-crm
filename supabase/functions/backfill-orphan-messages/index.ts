// Backfill: corrige whatsapp_messages legadas no banco EXTERNO que aparecem
// vazias no histórico do CRM porque:
//   • channel_id está NULL, ou
//   • channel_id contém o telefone (string) em vez do UUID do canal, ou
//   • organization_id está NULL.
//
// Estratégia de resolução, em ordem:
//   1) channel_id já é UUID válido e existe em channels → só popula organization_id.
//   2) channel_id parece telefone → casa por sufixo (8 dígitos) com channels.phone
//      DA ORG (resolvida via metadata.organization_id, metadata.channelId,
//      metadata.channel_phone ou — em última instância — única org candidata
//      cujo canal bate o telefone).
//   3) metadata.channelId / metadata.channel_id já é UUID → usa direto.
//   4) metadata.channel_phone → casa com channels.phone.
//
// Idempotente. Suporta dryRun, organizationId e paginação por created_at.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const internal = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChannelRow {
  id: string;
  organization_id: string;
  phone: string | null;
}

interface ChannelIndex {
  byId: Map<string, ChannelRow>;
  bySuffix: Map<string, ChannelRow[]>; // last 8 digits → channels
}

function digits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function suffix8(value: unknown): string {
  const d = digits(value);
  return d.length >= 8 ? d.slice(-8) : d;
}

async function loadChannelIndex(organizationId?: string | null): Promise<ChannelIndex> {
  let q = internal.from('channels').select('id, organization_id, phone');
  if (organizationId) q = q.eq('organization_id', organizationId);
  const { data, error } = await q;
  if (error) throw new Error(`channels load failed: ${error.message}`);
  const byId = new Map<string, ChannelRow>();
  const bySuffix = new Map<string, ChannelRow[]>();
  (data ?? []).forEach((c: any) => {
    byId.set(c.id, c);
    const s = suffix8(c.phone);
    if (!s) return;
    const arr = bySuffix.get(s) ?? [];
    arr.push(c);
    bySuffix.set(s, arr);
  });
  return { byId, bySuffix };
}

interface Resolution {
  channel_id: string;
  organization_id: string;
  reason: string;
}

function resolveRow(row: any, idx: ChannelIndex, scopedOrg: string | null): Resolution | null {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const candidateUuid = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null);

  // 1) channel_id já é UUID válido
  const directUuid = candidateUuid(row.channel_id);
  if (directUuid && idx.byId.has(directUuid)) {
    const ch = idx.byId.get(directUuid)!;
    if (!scopedOrg || ch.organization_id === scopedOrg) {
      return { channel_id: ch.id, organization_id: ch.organization_id, reason: 'uuid_in_channels' };
    }
  }

  // 3) metadata.channelId / channel_id é UUID
  const metaUuid = candidateUuid(meta.channelId) ?? candidateUuid(meta.channel_id);
  if (metaUuid && idx.byId.has(metaUuid)) {
    const ch = idx.byId.get(metaUuid)!;
    if (!scopedOrg || ch.organization_id === scopedOrg) {
      return { channel_id: ch.id, organization_id: ch.organization_id, reason: 'uuid_in_metadata' };
    }
  }

  // determinar org-alvo se possível
  const targetOrg =
    scopedOrg ??
    (typeof row.organization_id === 'string' && row.organization_id.length > 0 ? row.organization_id : null) ??
    candidateUuid(meta.organization_id) ??
    candidateUuid(meta.organizationId);

  // 4) metadata.channel_phone → bate com channels.phone
  const metaPhoneSuffix = suffix8(meta.channel_phone);
  if (metaPhoneSuffix) {
    const candidates = (idx.bySuffix.get(metaPhoneSuffix) ?? []).filter(
      (c) => !targetOrg || c.organization_id === targetOrg
    );
    if (candidates.length === 1) {
      const ch = candidates[0];
      return { channel_id: ch.id, organization_id: ch.organization_id, reason: 'metadata_channel_phone' };
    }
  }

  // 2) channel_id é telefone → bate com channels.phone na org
  const phoneSuffix = suffix8(row.channel_id);
  if (phoneSuffix) {
    const candidates = (idx.bySuffix.get(phoneSuffix) ?? []).filter(
      (c) => !targetOrg || c.organization_id === targetOrg
    );
    if (candidates.length === 1) {
      const ch = candidates[0];
      return { channel_id: ch.id, organization_id: ch.organization_id, reason: 'channel_id_is_phone' };
    }
  }

  return null;
}

interface RunOpts {
  organizationId: string | null;
  dryRun: boolean;
  maxBatches: number;
  batchSize: number;
  startCursor: string | null; // created_at iso para paginar (do mais novo pro mais antigo)
}

async function run(opts: RunOpts) {
  const ext = getExternalDb();
  const idx = await loadChannelIndex(opts.organizationId);

  let cursor = opts.startCursor ?? new Date().toISOString();
  let scanned = 0;
  let candidates = 0;
  let resolved = 0;
  let updated = 0;
  let unresolved = 0;
  const reasonCounts: Record<string, number> = {};
  const sampleUnresolved: any[] = [];

  for (let batch = 0; batch < opts.maxBatches; batch++) {
    let q = ext
      .from('whatsapp_messages')
      .select('id, channel_id, organization_id, sender_phone, metadata, created_at')
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(opts.batchSize);
    if (opts.organizationId) {
      // Inclui rows com org NULL (legado) OU já marcadas com a org alvo
      q = q.or(`organization_id.is.null,organization_id.eq.${opts.organizationId}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`scan failed: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) break;

    scanned += rows.length;
    cursor = rows[rows.length - 1].created_at;

    // Filtro: só linhas com channel_id inválido OU org NULL
    const orphans = rows.filter((r: any) => {
      const isUuid = typeof r.channel_id === 'string' && UUID_RE.test(r.channel_id) && idx.byId.has(r.channel_id);
      return !isUuid || !r.organization_id;
    });
    candidates += orphans.length;

    const updates: { id: string; channel_id: string; organization_id: string }[] = [];
    for (const r of orphans) {
      const res = resolveRow(r, idx, opts.organizationId);
      if (!res) {
        unresolved++;
        if (sampleUnresolved.length < 10) {
          sampleUnresolved.push({ id: r.id, channel_id: r.channel_id, sender_phone: r.sender_phone, organization_id: r.organization_id });
        }
        continue;
      }
      resolved++;
      reasonCounts[res.reason] = (reasonCounts[res.reason] ?? 0) + 1;
      // só envia update se realmente vai mudar algo
      if (r.channel_id !== res.channel_id || r.organization_id !== res.organization_id) {
        updates.push({ id: r.id, channel_id: res.channel_id, organization_id: res.organization_id });
      }
    }

    if (!opts.dryRun && updates.length) {
      // upsert por id (garante atualização parcial)
      const { error: upErr } = await ext.from('whatsapp_messages').upsert(updates, { onConflict: 'id' });
      if (upErr) throw new Error(`upsert failed: ${upErr.message}`);
      updated += updates.length;
    }

    if (rows.length < opts.batchSize) break;
  }

  return {
    organizationId: opts.organizationId,
    dryRun: opts.dryRun,
    scanned,
    candidates,
    resolved,
    updated,
    unresolved,
    reasonCounts,
    nextCursor: cursor,
    sampleUnresolved,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const opts: RunOpts = {
      organizationId: body.organizationId ?? null,
      dryRun: body.dryRun !== false ? body.dryRun !== false : false, // default true (seguro)
      maxBatches: Math.min(Number(body.maxBatches ?? 20), 100),
      batchSize: Math.min(Number(body.batchSize ?? 500), 1000),
      startCursor: body.startCursor ?? null,
    };
    // dryRun default = true se não vier no body
    if (typeof body.dryRun !== 'boolean') opts.dryRun = true;

    const result = await run(opts);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
