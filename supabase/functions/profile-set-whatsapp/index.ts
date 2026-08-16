import { corsHeaders, getCaller, json, serviceClient } from "../_shared/otpAuth.ts";

/** Valida o WhatsApp de um usuário: DDI 55 + DDD + celular 9 dígitos. */
function normalizeWhatsapp(input: string): { ok: boolean; e164: string; error?: string } {
  let digits = String(input || "").replace(/\D/g, "");
  if (!digits) return { ok: false, e164: "", error: "Informe o número de WhatsApp." };
  if (digits.length === 11) digits = "55" + digits;
  if (!/^55[1-9][1-9]9[6-9]\d{7}$/.test(digits)) {
    return { ok: false, e164: "", error: "Número inválido. Use DDD + celular com 9 dígitos." };
  }
  return { ok: true, e164: digits };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const parsed = normalizeWhatsapp((body as { whatsapp_phone?: string }).whatsapp_phone || "");
    if (!parsed.ok) return json({ error: parsed.error, reason: "invalid" }, 400);

    const db = serviceClient();

    // Duplicidade: número já vinculado a OUTRO usuário
    const { data: existing, error: dupError } = await db
      .from("profiles")
      .select("user_id")
      .eq("whatsapp_phone", parsed.e164)
      .neq("user_id", caller.id)
      .limit(1);

    if (dupError) {
      console.error("[profile-set-whatsapp] erro na checagem de duplicidade:", dupError.message);
      return json({ error: "Não foi possível validar o número. Tente novamente." }, 500);
    }
    if (existing && existing.length > 0) {
      console.warn("[profile-set-whatsapp] duplicado para", caller.id);
      return json(
        { error: "Este número já está cadastrado em outra conta. Use outro número.", reason: "duplicate" },
        409,
      );
    }

    const { error: updateError } = await db
      .from("profiles")
      .update({ whatsapp_phone: parsed.e164 })
      .eq("user_id", caller.id);

    if (updateError) {
      console.error("[profile-set-whatsapp] erro ao gravar:", updateError.message);
      return json({ error: "Não foi possível salvar o número. Tente novamente." }, 500);
    }

    // Confirmação em SELECT separado (não bloqueia o fluxo se não retornar)
    const { data: confirmed } = await db
      .from("profiles")
      .select("whatsapp_phone")
      .eq("user_id", caller.id)
      .maybeSingle();

    console.info("[profile-set-whatsapp] número gravado para", caller.id);
    return json({ success: true, whatsapp_phone: confirmed?.whatsapp_phone || parsed.e164 });
  } catch (error) {
    console.error("[profile-set-whatsapp] erro inesperado:", error);
    return json({ error: "Erro inesperado ao salvar o número." }, 500);
  }
});
