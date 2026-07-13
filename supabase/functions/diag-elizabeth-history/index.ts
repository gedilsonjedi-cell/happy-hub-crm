import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ext = getExternalDb();

  const { data, error } = await ext
    .from('whatsapp_messages')
    .select('id, channel_id, direction, sender_phone, content, metadata, created_at')
    .eq('channel_id', 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa')
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(3);

  // Also get an inbound sample for the same channel
  const { data: inbound } = await ext
    .from('whatsapp_messages')
    .select('id, channel_id, direction, sender_phone, content, metadata, created_at')
    .eq('channel_id', 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(3);

  return new Response(JSON.stringify({ outbound: data, error: error?.message, inbound }, null, 2), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
