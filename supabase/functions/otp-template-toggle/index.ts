import { corsHeaders, getCaller, isOtpAdminEmail, json, serviceClient } from "../_shared/otpAuth.ts";

/**
 * Liga/desliga a flag `otp_active` de um template de AUTENTICAÇÃO.
 * Somente a conta break-glass pode alterar (403 para qualquer outro).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);
    if (!isOtpAdminEmail(caller.email)) {
      return json({ error: "Somente a conta administradora do OTP pode alterar esta configuração." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const templateId = String(body.template_id || "");
    const active = body.otp_active === true;
    if (!templateId) return json({ error: "template_id é obrigatório." }, 400);

    const db = serviceClient();

    const { data: template, error: templateError } = await db
      .from("message_templates")
      .select("id, name, status, dispatch_type")
      .eq("id", templateId)
      .maybeSingle();

    if (templateError || !template) return json({ error: "Template não encontrado." }, 404);
    if (template.dispatch_type !== "service") {
      return json({ error: "Somente templates de autenticação podem ser usados no OTP." }, 400);
    }

    if (active) {
      const { count } = await db
        .from("channel_templates")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId);
      if (!count) return json({ error: "Vincule um canal (BM) a este template antes de ativá-lo para OTP." }, 400);
    }

    const { error } = await db
      .from("message_templates")
      .update({ otp_active: active })
      .eq("id", templateId);

    if (error) return json({ error: error.message }, 500);

    return json({ success: true, template_id: templateId, otp_active: active });
  } catch (error) {
    console.error("[otp-template-toggle] exceção:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
