const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

// Directly invoke external-db-proxy to see what it returns for Elizabeth's channel + a real phone
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = `https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/external-db-proxy`;
  const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjeWd2a2Z6cW1ha3hvcXV5d3pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNTYzNDEsImV4cCI6MjA4MTkzMjM0MX0.uDKwCq0niYu7mfgE-Qk9nXnRgp17OZYMeeq3TEseuyE';

  const body = {
    action: 'messages',
    channelId: 'b7bfd1a2-7270-4034-8c44-ac8e74f534aa',
    phoneVariants: ['5541992738422', '554192738422', '41992738422', '992738422', '92738422'],
    cursor: null,
    pageSize: 25,
    impersonatedOrgId: 'e9d90d5c-8dca-432d-850b-5643e0549ac0',
  };

  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new Response(JSON.stringify({
    status: res.status,
    ms: Date.now() - started,
    body: text.slice(0, 3000),
  }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
