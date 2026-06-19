import { getExternalDb } from '../_shared/externalDb.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const orgId = 'da11e337-48f5-496a-9472-e00ecb9cfc40';
  const ext = getExternalDb();

  // Active assignments today
  const since = '2026-06-19T00:00:00Z';
  const targetPhones = ['5511980931521','5511974888239','5511961360132','+5511980931521','+5511974888239','+5511961360132','11980931521','11974888239','11961360132'];
  const { data: assigns, error: e1 } = await ext
    .from('conversation_assignments')
    .select('id,conversation_phone,channel_id,assigned_to,status,created_at,updated_at,organization_id')
    .eq('organization_id', orgId)
    .in('conversation_phone', targetPhones)
    .limit(100);

  // Stats for those
  const ids = (assigns ?? []).map((a: any) => a.id);
  let stats: any[] = [];
  if (ids.length) {
    const { data } = await ext
      .from('conversation_stats')
      .select('assignment_id,unread_count,last_message_at,last_inbound_at')
      .in('assignment_id', ids);
    stats = data ?? [];
  }
  const statMap = new Map(stats.map((s: any) => [s.assignment_id, s]));

  // Recent inbound messages today for this org
  const { data: msgs, error: e2 } = await ext
    .from('whatsapp_messages')
    .select('*')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  const statusCounts: Record<string, number> = {};
  for (const a of assigns ?? []) {
    statusCounts[a.status ?? 'null'] = (statusCounts[a.status ?? 'null'] || 0) + 1;
  }

  const novos = (assigns ?? []).filter((a: any) => {
    const s = statMap.get(a.id);
    const truly =
      s &&
      s.last_inbound_at &&
      (!s.last_message_at || new Date(s.last_inbound_at) >= new Date(s.last_message_at));
    return (a.status === 'pending' || !a.assigned_to) && truly;
  });

  return new Response(
    JSON.stringify({
      assigns_total: assigns?.length ?? 0,
      statusCounts,
      inbound_msgs_today: msgs?.length ?? 0,
      sample_msgs: (msgs ?? []).slice(0, 10),
      novos_count: novos.length,
      sample_novos: novos.slice(0, 10),
      e1: e1?.message,
      e2: e2?.message,
    }, null, 2),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
