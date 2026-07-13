import { getExternalDb } from '../_shared/externalDb.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
  const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
  const projectRef = externalUrl.replace('https://', '').split('.')[0];

  // Use pg-meta REST endpoint to execute raw SQL
  const sql = `
    GRANT SELECT ON public.whatsapp_messages TO authenticated;
    GRANT SELECT ON public.whatsapp_contacts TO authenticated;
  `;

  // Use supabase REST via rpc if exists, else use PostgREST admin
  // Simpler: use pg-rest with service role via /rest/v1/rpc? No — we need raw SQL.
  // Use the SQL API via a custom function is not available. Instead, hit the
  // Supabase management API's SQL endpoint — needs access token, not available.
  // Alternative: use `postgres.js` via deno.
  const res = await fetch(`${externalUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  return new Response(JSON.stringify({
    status: res.status,
    body: await res.text(),
    projectRef,
  }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
