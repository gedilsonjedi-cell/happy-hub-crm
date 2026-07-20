// dedupe-assignments-external
// Merge linhas duplicadas de conversation_assignments no banco EXTERNO
// agrupadas por (channel_id, sufixo 8 dígitos do conversation_phone).
//
// Estratégia:
//  - Grupo com >1 rows → escolhe "winner": row com assigned_to != null
//    e maior updated_at; empate → maior updated_at global.
//  - Mescla campos ausentes no winner a partir dos losers (lead_id, sector_id,
//    assigned_to se winner vazio) — mas nunca sobrescreve assigned_to já
//    definido no winner.
//  - Atualiza conversation_stats.assignment_id dos losers para o winner.
//    Se stats do winner já existir, deleta a stat do loser (constraint UNIQUE).
//  - Deleta os losers.
//
// Body: { organizationId: string, dryRun?: boolean }
import { getExternalDb } from '../_shared/externalDb.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Assignment {
  id: string;
  channel_id: string | null;
  conversation_phone: string;
  assigned_to: string | null;
  status: string;
  sector_id: string | null;
  lead_id: string | null;
  updated_at: string;
  created_at: string;
  organization_id: string;
}

function suffixKey(phone: string, channelId: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return `${channelId ?? 'null'}|${digits.slice(-8)}`;
}

function pickWinner(rows: Assignment[]): Assignment {
  // Prefer com assigned_to, depois maior updated_at
  return [...rows].sort((a, b) => {
    if (!!a.assigned_to !== !!b.assigned_to) return a.assigned_to ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

  const body = await req.json().catch(() => ({}));
  const orgId = body.organizationId as string;
  const dryRun = !!body.dryRun;
  const maxGroups = Number(body.maxGroups) > 0 ? Number(body.maxGroups) : 20;
  if (!orgId) return new Response(JSON.stringify({ error: 'organizationId required' }), { status: 400, headers: cors });

  const ext = getExternalDb();

  // Fetch all assignments for org (in páginas de 1000)
  const all: Assignment[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await ext.from('conversation_assignments')
      .select('id, channel_id, conversation_phone, assigned_to, status, sector_id, lead_id, updated_at, created_at, organization_id')
      .eq('organization_id', orgId)
      .range(from, from + pageSize - 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    if (!data || data.length === 0) break;
    all.push(...data as Assignment[]);
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 200000) break;
  }

  const groups = new Map<string, Assignment[]>();
  for (const r of all) {
    const k = suffixKey(r.conversation_phone, r.channel_id);
    if (!k.endsWith('|')) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
  }

  const dupeGroups = Array.from(groups.entries()).filter(([, rows]) => rows.length > 1);
  const groupsToProcess = dupeGroups.slice(0, maxGroups);

  const report: any[] = [];
  let mergedCount = 0;
  let deletedCount = 0;

  for (const [key, rows] of groupsToProcess) {
    const winner = pickWinner(rows);
    const losers = rows.filter(r => r.id !== winner.id);

    // Merge missing fields into winner (only if empty)
    const patch: Record<string, unknown> = {};
    if (!winner.assigned_to) {
      const withAssignee = losers.find(l => l.assigned_to);
      if (withAssignee) patch.assigned_to = withAssignee.assigned_to;
    }
    if (!winner.sector_id) {
      const withSector = losers.find(l => l.sector_id);
      if (withSector) patch.sector_id = withSector.sector_id;
    }
    if (!winner.lead_id) {
      const withLead = losers.find(l => l.lead_id);
      if (withLead) patch.lead_id = withLead.lead_id;
    }
    // If winner is archived and any loser is active, promote winner
    if (winner.status === 'archived') {
      const active = losers.find(l => l.status === 'in_progress' || l.status === 'pending' || l.status === 'active');
      if (active) patch.status = active.status;
    }

    const entry: any = { key, kept: winner.id, kept_assigned_to: winner.assigned_to, patch, losers: losers.map(l => ({ id: l.id, assigned_to: l.assigned_to, status: l.status })) };
    report.push(entry);

    if (dryRun) continue;

    // Apply patch to winner
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { error: upErr } = await ext.from('conversation_assignments').update(patch).eq('id', winner.id);
      if (upErr) { entry.error = `winner update: ${upErr.message}`; continue; }
    }

    for (const loser of losers) {
      // Handle stats collision
      const { data: winnerStat } = await ext.from('conversation_stats').select('id, unread_count, last_message_at, last_inbound_at, last_message_content, sender_name').eq('assignment_id', winner.id).maybeSingle();
      const { data: loserStat } = await ext.from('conversation_stats').select('id, unread_count, last_message_at, last_inbound_at, last_message_content, sender_name').eq('assignment_id', loser.id).maybeSingle();

      if (loserStat) {
        if (winnerStat) {
          // Merge: keep max unread, latest last_message_at
          const mergedUnread = (winnerStat.unread_count || 0) + (loserStat.unread_count || 0);
          const winnerLast = winnerStat.last_message_at ? new Date(winnerStat.last_message_at).getTime() : 0;
          const loserLast = loserStat.last_message_at ? new Date(loserStat.last_message_at).getTime() : 0;
          const mergedLast = loserLast > winnerLast ? loserStat : winnerStat;
          await ext.from('conversation_stats').update({
            unread_count: mergedUnread,
            last_message_at: mergedLast.last_message_at,
            last_inbound_at: mergedLast.last_inbound_at,
            last_message_content: mergedLast.last_message_content,
            sender_name: mergedLast.sender_name,
            updated_at: new Date().toISOString(),
          }).eq('id', winnerStat.id);
          await ext.from('conversation_stats').delete().eq('id', loserStat.id);
        } else {
          await ext.from('conversation_stats').update({ assignment_id: winner.id }).eq('id', loserStat.id);
        }
      }

      const { error: delErr } = await ext.from('conversation_assignments').delete().eq('id', loser.id);
      if (delErr) { entry.error = `delete loser ${loser.id}: ${delErr.message}`; continue; }
      deletedCount++;
    }
    mergedCount++;
  }

  return new Response(
    JSON.stringify({ dryRun, total_scanned: all.length, duplicate_groups: dupeGroups.length, merged: mergedCount, deleted: deletedCount, report }, null, 2),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
