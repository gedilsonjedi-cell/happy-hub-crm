import { brasiliaToday, corsHeaders, getCaller, hashCode, isOtpAdminEmail, json, serviceClient } from "../_shared/otpAuth.ts";

const META_API_BASE = "https://graph.facebook.com/v22.0";
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);

    const db = serviceClient();

    const { data: settings } = await db
      .from("otp_settings")
      .select("otp_login_enabled, otp_channel_id, otp_template_name, otp_template_language")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.otp_login_enabled) return json({ error: "OTP está desligado." }, 400);
    if (isOtpAdminEmail(caller.email)) return json({ success: true, skipped: true });
    if (!settings.otp_channel_id || !settings.otp_template_name) {
      return json({ error: "OTP não está configurado (canal/template)." }, 400);
    }

    const { data: profile } = await db
      .from("profiles").select("whatsapp_phone").eq("user_id", caller.id).maybeSingle();
    const phone = String(profile?.whatsapp_phone || "").replace(/\D/g, "");
    if (!phone) return json({ error: "Seu WhatsApp não está cadastrado no perfil." }, 400);

    // Cooldown de reenvio
    const { data: last } = await db
      .from("otp_codes").select("created_at").eq("user_id", caller.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.created_at) {
      const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return json({ error: "Aguarde para reenviar.", retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) }, 429);
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code, caller.id);
    const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    // Credenciais do canal (colunas sensíveis exigem service role)
    const { data: channel, error: channelError } = await db
      .from("channels").select("access_token, app_name").eq("id", settings.otp_channel_id).single();
    if (channelError || !channel?.access_token || !channel?.app_name) {
      return json({ error: "Canal de OTP sem credenciais válidas." }, 500);
    }

    // Template de AUTENTICAÇÃO da Meta: código no corpo E no botão de copiar código.
    const buildPayload = (buttonComponent: Record<string, unknown> | null) => ({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template: {
        name: settings.otp_template_name,
        language: { code: settings.otp_template_language || "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          ...(buttonComponent ? [buttonComponent] : []),
        ],
      },
    });

    const attempts = [
      buildPayload({ type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: code }] }),
      buildPayload({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }),
      buildPayload(null),
    ];

    let sent = false;
    let lastError = "Falha ao enviar o código.";
    for (const payload of attempts) {
      const res = await fetch(`${META_API_BASE}/${channel.app_name}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${channel.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result?.messages?.length) { sent = true; break; }
      lastError = result?.error?.message || `Erro ${res.status} ao enviar o código.`;
      console.error("[otp-request] envio falhou:", JSON.stringify(result?.error || result));
    }

    if (!sent) return json({ error: lastError }, 502);

    await db.from("otp_codes").insert({ user_id: caller.id, code_hash, expires_at });

    return json({ success: true, expiresAt: expires_at, cooldown: RESEND_COOLDOWN_SECONDS, today: brasiliaToday() });
  } catch (error) {
    console.error("[otp-request] exceção:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
