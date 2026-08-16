import { corsHeaders, getCaller, isOtpAdminEmail, json, serviceClient } from "../_shared/otpAuth.ts";
import { getOtpPool } from "../_shared/otpPool.ts";

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

    const db = serviceClient();

    // Não deixa ligar o OTP sem nenhum template de autenticação ativo (evita travar todo mundo).
    if (patch.otp_login_enabled === true) {
      const pool = await getOtpPool(db);
      if (pool.length === 0) {
        return json({ error: "Ative pelo menos um template de autenticação para OTP antes de ligar." }, 400);
      }
    }

    const { data, error } = await db
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
