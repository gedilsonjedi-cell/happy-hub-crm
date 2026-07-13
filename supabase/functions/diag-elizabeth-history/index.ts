import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ext = getExternalDb();

  const channelId = 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa';
  // Mimic the frontend's .or() with phone strings mixed with uuid
  const orFilter = [
    'channel_id.eq.5541992738422',
    'channel_id.eq.554199273842',
    'channel_id.eq.41992738422',
    `channel_id.eq.${channelId}`,
  ].join(',');

  const { data, error } = await ext
    .from('whatsapp_messages')
    .select('id, channel_id, direction, sender_phone, created_at')
    .or(orFilter)
    .eq('direction', 'inbound')
    .lt('created_at', new Date(Date.now() + 120_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  // Also try with only UUID
  const { data: uuidOnly, error: err2 } = await ext
    .from('whatsapp_messages')
    .select('id, sender_phone, direction, created_at')
    .eq('channel_id', channelId)
    .eq('direction', 'inbound')
    .like('sender_phone', '%92738422')
    .order('created_at', { ascending: false })
    .limit(3);

  return new Response(JSON.stringify({
    or_result: { count: data?.length, error: error?.message, code: (error as any)?.code, sample: data?.slice(0,2) },
    uuid_only: { count: uuidOnly?.length, error: err2?.message, sample: uuidOnly },
  }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
