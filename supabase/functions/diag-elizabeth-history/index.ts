import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
  const externalAnon = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!;
  const externalJwtSecret = Deno.env.get('EXTERNAL_SUPABASE_JWT_SECRET')!;

  // Mint a fake user JWT with Elizabeth's org
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(externalJwtSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  const token = await create({ alg: 'HS256', typ: 'JWT' }, {
    sub: '00000000-0000-0000-0000-000000000001',
    organization_id: 'e9d90d5c-8dca-432d-850b-5643e0549ac0',
    role: 'authenticated',
    iss: 'supabase',
    iat: getNumericDate(0),
    exp: getNumericDate(300),
  }, key);

  const client = createClient(externalUrl, externalAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channelId = 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa';
  const { data, error } = await client
    .from('whatsapp_messages')
    .select('id, channel_id, direction, sender_phone, created_at, organization_id')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(3);

  const orFilter = [
    'channel_id.eq.5541992738422',
    `channel_id.eq.${channelId}`,
  ].join(',');
  const { data: orData, error: orErr } = await client
    .from('whatsapp_messages')
    .select('id, channel_id, direction, sender_phone, created_at')
    .or(orFilter)
    .eq('direction', 'inbound')
    .lt('created_at', new Date(Date.now() + 120_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(3);

  return new Response(JSON.stringify({
    plain: { count: data?.length, error: error?.message, sample: data },
    or_query: { count: orData?.length, error: orErr?.message, code: (orErr as any)?.code, sample: orData },
  }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
