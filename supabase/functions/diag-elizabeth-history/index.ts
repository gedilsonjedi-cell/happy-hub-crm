import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const orgId = 'e9d90d5c-8dca-432d-850b-5643e0549ac0';
  const ext = getExternalDb();

  const channels = ['10d4bfa4-9291-4ea7-8725-ccee22dcd3f4', 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa'];

  // Count messages per channel for this org
  const results: Record<string, unknown> = {};
  for (const chId of channels) {
    const { count, error } = await ext
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', chId);
    results[chId] = { count, error: error?.message };
  }

  // Also count by organization_id
  const { count: orgCount, error: orgErr } = await ext
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  // Sample last 5 messages
  const { data: sample, error: sampleErr } = await ext
    .from('whatsapp_messages')
    .select('id, channel_id, organization_id, direction, sender_phone, created_at, content')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Check RAFAEL phone 41992738422
  const { data: rafael, error: rafErr } = await ext
    .from('whatsapp_messages')
    .select('id, channel_id, organization_id, direction, sender_phone, created_at, metadata')
    .or('sender_phone.like.%41992738422,sender_phone.like.%4192738422')
    .order('created_at', { ascending: false })
    .limit(10);

  return new Response(
    JSON.stringify({
      per_channel: results,
      org_total: { count: orgCount, error: orgErr?.message },
      sample_org: { data: sample, error: sampleErr?.message },
      rafael: { data: rafael, error: rafErr?.message },
    }, null, 2),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
