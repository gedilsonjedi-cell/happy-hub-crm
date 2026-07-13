import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ext = getExternalDb();

  const channelId = 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa';
  const suffix = '92738422';

  // Search by destination metadata (outbound)
  const { data: outbound, error: e1 } = await ext
    .from('whatsapp_messages')
    .select('id, direction, sender_phone, content, metadata->>destination as dest, created_at')
    .eq('channel_id', channelId)
    .eq('direction', 'outbound')
    .filter('metadata->>destination', 'like', `%${suffix}`)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: inbound, error: e2 } = await ext
    .from('whatsapp_messages')
    .select('id, direction, sender_phone, content, created_at')
    .eq('channel_id', channelId)
    .eq('direction', 'inbound')
    .like('sender_phone', `%${suffix}`)
    .order('created_at', { ascending: false })
    .limit(5);

  return new Response(JSON.stringify({
    outbound: { data: outbound, error: e1?.message },
    inbound: { data: inbound, error: e2?.message },
  }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
