import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const orgId = 'da11e337-48f5-496a-9472-e00ecb9cfc40';
  const ext = getExternalDb();
  const since = '2026-06-19T00:00:00Z';

  // 1. Pega inbounds hoje
  const { data: msgs } = await ext
    .from('whatsapp_messages')
    .select('sender_phone')
    .eq('organization_id', orgId)
    .eq('direction', 'inbound')
    .gte('created_at', since);

  const phones = Array.from(new Set((msgs ?? []).map((m: any) => String(m.sender_phone).replace(/^\+/, ''))));

  // 2. Acha assignments archived sem dono para esses phones
  const { data: assigns } = await ext
    .from('conversation_assignments')
    .select('id,conversation_phone,status,assigned_to')
    .eq('organization_id', orgId)
    .eq('status', 'archived')
    .is('assigned_to', null)
    .in('conversation_phone', phones);

  const ids = (assigns ?? []).map((a: any) => a.id);
  if (ids.length) {
    await ext
      .from('conversation_assignments')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .in('id', ids);
  }

  return new Response(
    JSON.stringify({ reactivated: ids.length, ids, phones_with_inbound: phones.length }, null, 2),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
