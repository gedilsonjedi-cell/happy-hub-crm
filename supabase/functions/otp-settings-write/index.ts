import { corsHeaders, getCaller, isOtpAdminEmail, json, serviceClient } from "../_shared/otpAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);
    if (!isOtpAdminEmail(caller.email)) {
      console.warn("[otp-settings-write] tentativa não autorizada:", caller.email);
      return json({ error: "Somente a conta administradora do OTP pode alterar esta configuração." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { id: true, updated_by: caller.id };

    if (typeof body.otp_login_enabled === "boolean") patch.otp_login_enabled = body.otp_login_enabled;
    if ("otp_channel_id" in body) patch.otp_channel_id = body.otp_channel_id || null;
    if ("otp_template_name" in body) patch.otp_template_name = body.otp_template_name || null;
    if ("otp_template_language" in body) patch.otp_template_language = body.otp_template_language || "pt_BR";

    // Não deixa ligar o OTP sem canal e template configurados (evita travar todo mundo).
    if (patch.otp_login_enabled === true) {
      const { data: current } = await serviceClient()
        .from("otp_settings").select("otp_channel_id, otp_template_name").eq("id", true).maybeSingle();
      const channelId = (patch.otp_channel_id ?? current?.otp_channel_id) as string | null;
      const templateName = (patch.otp_template_name ?? current?.otp_template_name) as string | null;
      if (!channelId || !templateName) {
        return json({ error: "Configure o canal e o template antes de ligar o OTP." }, 400);
      }
    }

    const { data, error } = await serviceClient()
      .from("otp_settings")
      .upsert(patch, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[otp-settings-write] erro:", error.message);
      return json({ error: error.message }, 500);
    }

    return json({ success: true, settings: data });
  } catch (error) {
    console.error("[otp-settings-write] exceção:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
