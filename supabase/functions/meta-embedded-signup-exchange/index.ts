import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => {
  if (status >= 400) console.error("[embedded-signup] resposta", status, JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

const META_APP_ID = "1095955566297881";
const GRAPH = "https://graph.facebook.com/v20.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      return json({ error: "META_APP_SECRET não configurado nos segredos do projeto." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado." }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const caller = userData?.user;
    if (userErr || !caller) console.error("[embedded-signup] getUser", userErr?.message);
    if (userErr || !caller) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    let phoneNumberId = body?.phone_number_id ? String(body.phone_number_id).trim() : "";
    const wabaId = body?.waba_id ? String(body.waba_id).trim() : "";
    const organizationId = body?.organization_id ? String(body.organization_id).trim() : "";
    console.log("[embedded-signup] request", JSON.stringify({ hasCode: !!code, phoneNumberId, wabaId, organizationId }));

    if (!code || (!phoneNumberId && !wabaId) || !organizationId) {
      return json(
        {
          error: "Parâmetros obrigatórios ausentes.",
          missing: {
            code: !code,
            phone_number_id: !phoneNumberId && !wabaId,
            organization_id: !organizationId,
          },
        },
        400,
      );
    }

    // 1) Troca o code por access token
    // Código vem do Embedded Signup SDK JS: não enviar redirect_uri.
    const exchangeUrl =
      `${GRAPH}/oauth/access_token?client_id=${META_APP_ID}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`;

    const exRes = await fetch(exchangeUrl);
    const exJson = await exRes.json().catch(() => ({}));
    if (!exRes.ok || !exJson?.access_token) {
      console.error("[embedded-signup] falha na troca do code", JSON.stringify(exJson));
      return json({ error: "Falha ao trocar o código pelo token da Meta.", meta: exJson }, 400);
    }

    let token: string = exJson.access_token;

    // 2) Tenta long-lived token
    try {
      const llUrl =
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(token)}`;
      const llRes = await fetch(llUrl);
      const llJson = await llRes.json().catch(() => ({}));
      if (llRes.ok && llJson?.access_token) {
        token = llJson.access_token;
      } else {
        console.warn("[embedded-signup] long-lived token indisponível:", JSON.stringify(llJson));
      }
    } catch (e) {
      console.warn("[embedded-signup] erro ao obter long-lived token:", String(e));
    }

    // 2b) Coexistência sem phone_number_id: descobre pela WABA
    if (!phoneNumberId && wabaId) {
      const lr = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lj = await lr.json().catch(() => ({}));
      phoneNumberId = lj?.data?.[0]?.id ? String(lj.data[0].id) : "";
      if (!phoneNumberId) {
        console.error("[embedded-signup] WABA sem números", JSON.stringify(lj));
        return json({ error: "Nenhum número encontrado na WABA.", meta: lj }, 400);
      }
    }

    // 3) Detalhes do número
    const phoneRes = await fetch(
      `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const phoneJson = await phoneRes.json().catch(() => ({}));
    if (!phoneRes.ok || phoneJson?.error) {
      console.error("[embedded-signup] falha ao buscar número", JSON.stringify(phoneJson));
      return json({ error: "Falha ao buscar detalhes do número na Meta.", meta: phoneJson }, 400);
    }

    const rawPhone = String(phoneJson.display_phone_number || "");
    const digits = rawPhone.replace(/\D/g, "");
    const phone = digits ? `+${digits}` : rawPhone;
    const name = String(phoneJson.verified_name || rawPhone || phoneNumberId);

    // 4) Canal existente?
    const { data: existing } = await admin
      .from("channels")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("app_name", phoneNumberId)
      .maybeSingle();

    let channelId = existing?.id as string | undefined;

    if (channelId) {
      const { error: updErr } = await admin
        .from("channels")
        .update({ name, phone, provider: "meta", waba_id: wabaId || null, access_token: token })
        .eq("id", channelId);
      if (updErr) return json({ error: `Falha ao atualizar canal: ${updErr.message}` }, 400);
    } else {
      const { data: created, error: insErr } = await admin
        .from("channels")
        .insert({
          organization_id: organizationId,
          user_id: caller.id,
          name,
          phone,
          provider: "meta",
          app_name: phoneNumberId,
          waba_id: wabaId || null,
          access_token: token,
          connected: false,
        })
        .select("id")
        .single();
      if (insErr || !created) {
        return json({ error: `Falha ao criar canal: ${insErr?.message ?? "desconhecido"}` }, 400);
      }
      channelId = created.id;
    }

    const { error: secErr } = await admin
      .from("channel_secrets")
      .upsert({ channel_id: channelId, access_token: token }, { onConflict: "channel_id" });
    if (secErr) {
      console.error("[embedded-signup] falha ao salvar token", secErr.message);
      return json({ error: `Canal criado, mas falhou ao salvar o token: ${secErr.message}` }, 400);
    }

    const { data: channel } = await admin
      .from("channels")
      .select("id, name, phone, provider, app_name, waba_id, connected, organization_id")
      .eq("id", channelId)
      .single();

    return json({ success: true, channel });
  } catch (e) {
    console.error("[embedded-signup] erro inesperado", String(e));
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
