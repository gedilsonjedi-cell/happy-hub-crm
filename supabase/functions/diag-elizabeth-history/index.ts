const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const keys = Object.keys(Deno.env.toObject()).filter(k => !k.startsWith('SUPABASE_') || k.includes('DB'));
  return new Response(JSON.stringify(keys.sort(), null, 2), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
});
