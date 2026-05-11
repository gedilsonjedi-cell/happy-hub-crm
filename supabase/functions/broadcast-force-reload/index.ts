// broadcast-force-reload
// Envia broadcast Realtime no canal "app-updates" (event "force-reload"),
// disparando limpeza de cache + reload em TODOS os clientes online.
//
// Auth: super_admin obrigatório.
// Body: { version?: string, reason?: string, hard?: boolean }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const svc = createClient(url, service);
    const { data: roleRow } = await svc.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
    if (!roleRow) return json({ error: 'super_admin required' }, 403);

    const body = await req.json().catch(() => ({}));
    const version = String(body.version || `${Date.now()}`);
    const reason = String(body.reason || 'manual');
    const hard = body.hard !== false;

    // Envia via Supabase Realtime REST broadcast endpoint
    const broadcastUrl = `${url}/realtime/v1/api/broadcast`;
    const res = await fetch(broadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: service,
        Authorization: `Bearer ${service}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: 'app-updates',
            event: 'force-reload',
            payload: { version, reason, hard, sentAt: new Date().toISOString() },
            private: false,
          },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[broadcast-force-reload] realtime error', res.status, text);
      return json({ error: 'broadcast failed', status: res.status, body: text }, 500);
    }

    return json({ success: true, version, reason, hard });
  } catch (err) {
    console.error('[broadcast-force-reload]', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
