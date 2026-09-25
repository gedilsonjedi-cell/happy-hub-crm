import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify token accepted by meta-webhook GET handler for WABA-level override callbacks.
export const OVERRIDE_VERIFY_TOKEN = 'optimus_meta_override_v1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/meta-webhook`;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function subscribeWaba(wabaId: string, accessToken: string) {
  // override_callback_uri makes Meta deliver this WABA's events to OUR current
  // server, regardless of the callback configured at the Meta app level.
  const resp = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ override_callback_uri: CALLBACK_URL, verify_token: OVERRIDE_VERIFY_TOKEN }),
  });
  const data = await resp.json().catch(() => ({}));
  console.log(`[meta-subscribe-webhook] WABA ${wabaId} ->`, resp.status, JSON.stringify(data));
  if (data?.error) {
    // Fallback: plain subscription (still better than nothing)
    const r2 = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d2 = await r2.json().catch(() => ({}));
    return { ok: false, override: false, error: data.error, fallback: d2 };
  }
  return { ok: true, override: true, data };
}

async function tokenFor(channelId?: string, wabaId?: string, phoneNumberId?: string) {
  let q = admin.from('channels').select('id, waba_id, channel_secrets(access_token)').eq('provider', 'meta');
  if (channelId) q = q.eq('id', channelId);
  else if (phoneNumberId) q = q.eq('app_name', phoneNumberId);
  else if (wabaId) q = q.eq('waba_id', wabaId);
  const { data } = await q.limit(20);
  for (const c of data ?? []) {
    const s: any = Array.isArray((c as any).channel_secrets) ? (c as any).channel_secrets[0] : (c as any).channel_secrets;
    if (s?.access_token) return { token: s.access_token as string, waba: (c as any).waba_id as string };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    let { phoneNumberId, accessToken, wabaId, channelId, all } = body as Record<string, any>;

    // Bulk mode: resubscribe every meta channel that has a stored token.
    if (all === true) {
      const { data } = await admin.from('channels')
        .select('id, name, waba_id, channel_secrets(access_token)').eq('provider', 'meta').not('waba_id', 'is', null);
      const done = new Set<string>();
      const results: unknown[] = [];
      for (const c of data ?? []) {
        const s: any = Array.isArray((c as any).channel_secrets) ? (c as any).channel_secrets[0] : (c as any).channel_secrets;
        const w = String((c as any).waba_id).trim();
        if (!s?.access_token) { results.push({ channel: c.name, skipped: 'sem token' }); continue; }
        if (done.has(w)) continue;
        done.add(w);
        results.push({ channel: c.name, waba: w, ...(await subscribeWaba(w, s.access_token)) });
      }
      return json({ success: true, callback: CALLBACK_URL, results });
    }

    if (!accessToken || !wabaId) {
      const found = await tokenFor(channelId, wabaId, phoneNumberId);
      accessToken = accessToken || found?.token;
      wabaId = wabaId || found?.waba;
    }
    if (!accessToken) return json({ error: 'Access Token é obrigatório' }, 400);
    if (!wabaId) return json({ error: 'WABA ID é obrigatório para inscrever o webhook com segurança' }, 400);

    const r = await subscribeWaba(String(wabaId).trim(), accessToken);
    if (!r.ok && !(r as any).fallback?.success) {
      return json({ success: false, error: (r as any).error?.message || 'Erro ao inscrever no webhook', details: (r as any).error }, 400);
    }
    return json({ success: true, message: 'Webhook inscrito com sucesso!', callback: CALLBACK_URL, ...r });
  } catch (error) {
    console.error('[meta-subscribe-webhook] Error:', error);
    return json({ error: 'Erro interno', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
