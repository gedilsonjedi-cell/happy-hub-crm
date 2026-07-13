import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const dbUrl = Deno.env.get('EXTERNAL_SUPABASE_DB_URL');
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'EXTERNAL_SUPABASE_DB_URL missing', envs: Object.keys(Deno.env.toObject()).filter(k => k.startsWith('EXTERNAL')) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const r1 = await sql.unsafe(`GRANT SELECT ON public.whatsapp_messages TO authenticated;`);
    const r2 = await sql.unsafe(`GRANT SELECT ON public.whatsapp_contacts TO authenticated;`);
    const r3 = await sql.unsafe(`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name IN ('whatsapp_messages','whatsapp_contacts')
      ORDER BY table_name, grantee;
    `);
    return new Response(JSON.stringify({ ok: true, grants: r3 }, null, 2), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } finally {
    await sql.end();
  }
});
