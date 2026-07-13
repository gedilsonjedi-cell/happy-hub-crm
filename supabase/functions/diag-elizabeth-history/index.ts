import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ext = getExternalDb();

  const { data, error } = await ext.rpc('pg_policies_json' as never, {} as never).select?.() ?? { data: null, error: null };

  const { data: policies, error: perr } = await ext
    .from('pg_policies' as never)
    .select('*')
    .eq('tablename', 'whatsapp_messages');

  return new Response(JSON.stringify({ policies, perr: perr?.message }, null, 2), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
