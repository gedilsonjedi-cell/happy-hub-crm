import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { channelId, action } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: ch } = await supabase
      .from('channels')
      .select('id, name, phone, app_name, waba_id')
      .eq('id', channelId)
      .single();
    if (!ch) return new Response(JSON.stringify({ error: 'channel not found' }), { status: 404, headers: corsHeaders });

    const { data: sec } = await supabase
      .from('channel_secrets')
      .select('access_token')
      .eq('channel_id', channelId)
      .single();
    const token = sec?.access_token;
    if (!token) return new Response(JSON.stringify({ error: 'no token' }), { status: 400, headers: corsHeaders });

    const pnId = ch.app_name;
    const waba = ch.waba_id;

    const results: Record<string, unknown> = { channel: ch };

    if (action === 'register') {
      const rr = await fetch(`https://graph.facebook.com/v21.0/${pnId}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin: '000000' }),
      });
      results.register = await rr.json();
    }



    // 1. Phone status
    const phoneUrl = `https://graph.facebook.com/v21.0/${pnId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status,platform_type,throughput,messaging_limit_tier,account_mode,is_pin_enabled,is_official_business_account,eligibility_for_api_business_global_search`;
    const pr = await fetch(phoneUrl, { headers: { Authorization: `Bearer ${token}` } });
    results.phone = await pr.json();

    // 2. WABA status
    const wabaUrl = `https://graph.facebook.com/v21.0/${waba}?fields=id,name,account_review_status,business_verification_status,country,currency,message_template_namespace,ownership_type,on_behalf_of_business_info,primary_funding_id,status`;
    const wr = await fetch(wabaUrl, { headers: { Authorization: `Bearer ${token}` } });
    results.waba = await wr.json();

    // 3. Health status
    const healthUrl = `https://graph.facebook.com/v21.0/${pnId}?fields=health_status`;
    const hr = await fetch(healthUrl, { headers: { Authorization: `Bearer ${token}` } });
    results.health = await hr.json();

    // 4. Template mf_molde_0107_ status
    const tplUrl = `https://graph.facebook.com/v21.0/${waba}/message_templates?name=mf_molde_0107_&fields=name,status,language,category,quality_score,rejected_reason`;
    const tr = await fetch(tplUrl, { headers: { Authorization: `Bearer ${token}` } });
    results.template = await tr.json();

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
