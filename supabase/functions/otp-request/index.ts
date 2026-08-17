import { brasiliaToday, corsHeaders, getCaller, hashCode, isOtpAdminEmail, json, serviceClient } from "../_shared/otpAuth.ts";
import { getOtpPool } from "../_shared/otpPool.ts";

const META_API_BASE = "https://graph.facebook.com/v22.0";
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const LANGUAGE_FALLBACKS = ["pt_BR", "pt", "en_US"];
const PROFILE_READ_RETRY_DELAYS_MS = [0, 250, 600];

type TemplateDef = { language: string; buttonType: "url" | "copy_code" | null };

/** Lê a definição real do template na Meta (idioma + tipo de botão OTP). */
async function fetchTemplateDefinition(
  wabaId: string | null,
  templateName: string,
  accessToken: string,
): Promise<TemplateDef | null> {
  if (!wabaId) return null;
  try {
    const res = await fetch(
      `${META_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}&access_token=${accessToken}`,
    );
    const body = await res.json().catch(() => ({}));
    const tpl = (body?.data || []).find((t: any) => t?.name === templateName && t?.status === "APPROVED")
      || (body?.data || [])[0];
    if (!tpl) return null;
    const buttons = (tpl.components || []).find((c: any) => c.type === "BUTTONS")?.buttons || [];
    const first = buttons[0];
    const buttonType = !first
      ? null
      : String(first.type).toUpperCase() === "URL"
        ? "url"
        : "copy_code";
    return { language: tpl.language || "pt_BR", buttonType };
  } catch (error) {
    console.error("[otp-request] falha ao ler definição do template:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Não autenticado" }, 401);

    const db = serviceClient();

    const { data: settings } = await db
      .from("otp_settings")
      .select("otp_login_enabled")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.otp_login_enabled) {
      console.warn("[otp-request] recusado: kill-switch desligado");
      return json({ error: "OTP está desligado.", reason: "disabled" }, 400);
    }
    if (isOtpAdminEmail(caller.email)) return json({ success: true, skipped: true });

    let phone = "";
    for (let attempt = 0; attempt < PROFILE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = PROFILE_READ_RETRY_DELAYS_MS[attempt];
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

      const { data: profile, error: profileError } = await db
        .from("profiles").select("whatsapp_phone").eq("user_id", caller.id).maybeSingle();
      if (profileError) {
        console.warn(`[otp-request] leitura do perfil falhou tentativa=${attempt + 1}:`, profileError.message);
      }
      phone = String(profile?.whatsapp_phone || "").replace(/\D/g, "");
      if (phone) {
        if (attempt > 0) console.info(`[otp-request] whatsapp_phone propagado na tentativa=${attempt + 1}`);
        break;
      }
      console.warn(`[otp-request] whatsapp_phone vazio tentativa=${attempt + 1}/${PROFILE_READ_RETRY_DELAYS_MS.length}`);
    }
    if (!phone) {
      console.warn("[otp-request] recusado: perfil sem whatsapp_phone após retries", caller.id);
      return json({ error: "Seu WhatsApp não está cadastrado no perfil.", reason: "no_phone" }, 400);
    }

    // Cooldown de reenvio
    const { data: last } = await db
      .from("otp_codes").select("created_at").eq("user_id", caller.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.created_at) {
      const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
        console.warn("[otp-request] recusado: cooldown", retryAfter);
        return json({ error: `Aguarde ${retryAfter}s para reenviar.`, reason: "cooldown", retryAfter }, 429);
      }
    }

    // Pool de templates de OTP (rodízio: menos usado recentemente primeiro)
    const pool = await getOtpPool(db);
    console.log("[otp-request] pool:", pool.map((p) => `${p.templateName}@${p.phoneNumberId}`).join(", ") || "vazio");
    if (pool.length === 0) {
      return json({ error: "Nenhum template de OTP ativo configurado.", reason: "empty_pool" }, 400);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code, caller.id);
    const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    // Template de AUTENTICAÇÃO da Meta: código no corpo E no botão de copiar código.
    const buildPayload = (
      templateName: string,
      language: string,
      buttonComponent: Record<string, unknown> | null,
    ) => ({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          ...(buttonComponent ? [buttonComponent] : []),
        ],
      },
    });

    const urlButton = { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] };
    const copyCodeButton = {
      type: "button", sub_type: "copy_code", index: "0",
      parameters: [{ type: "coupon_code", coupon_code: code }],
    };

    let sentWith: { templateId: string; templateName: string; channelId: string } | null = null;
    const failures: string[] = [];

    // Erros de conta/token/BM: não adianta variar idioma ou botão — pule para a próxima BM.
    const FATAL_META_CODES = new Set([10, 190, 200, 368, 131031, 133010, 141014]);

    for (const entry of pool) {
      let fatalForEntry = false;
      // Idioma e tipo de botão vêm da definição REAL do template na Meta (evita chute).
      const def = await fetchTemplateDefinition(entry.wabaId, entry.templateName, entry.accessToken);
      console.log(`[otp-request] template=${entry.templateName} def=${JSON.stringify(def)}`);

      const languages = def?.language
        ? [def.language, ...LANGUAGE_FALLBACKS.filter((l) => l !== def.language)]
        : LANGUAGE_FALLBACKS;
      const buttons: Array<Record<string, unknown> | null> =
        def?.buttonType === "url" ? [urlButton, copyCodeButton, null]
        : def?.buttonType === "copy_code" ? [copyCodeButton, urlButton, null]
        : def ? [null, urlButton, copyCodeButton]
        : [urlButton, copyCodeButton, null];

      for (const language of languages) {
        for (const button of buttons) {
          const res = await fetch(`${META_API_BASE}/${entry.phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${entry.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(entry.templateName, language, button)),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result?.messages?.length) {
            sentWith = { templateId: entry.templateId, templateName: entry.templateName, channelId: entry.channelId };
            break;
          }
          const metaError = result?.error || {};
          const code = Number(metaError.code ?? 0);
          const subcode = Number(metaError.error_subcode ?? 0);
          const detail = `${entry.templateName}@${entry.channelName}: (#${code || res.status}${subcode ? `/${subcode}` : ""}) ${metaError.message || `Erro ${res.status}`}`;
          console.error(`[otp-request] falha ${detail} lang=${language}`, JSON.stringify(metaError || result));
          if (FATAL_META_CODES.has(code)) {
            // Conta/BM/token bloqueados: registra uma vez e pula para a próxima BM do rodízio.
            failures.push(detail);
            fatalForEntry = true;
            break;
          }
          if (!failures.includes(detail)) failures.push(detail);
        }
        if (sentWith || fatalForEntry) break;
      }
      if (sentWith) break;
      // Marca tentativa para não insistir sempre no mesmo template quebrado
      await db.from("message_templates").update({ otp_last_used_at: new Date().toISOString() }).eq("id", entry.templateId);
    }

    if (!sentWith) {
      const message = failures.length
        ? `Nenhuma BM conseguiu enviar o código. ${failures.join(" | ")}`
        : "Falha ao enviar o código.";
      console.error("[otp-request] pool esgotado:", message);
      return json({ error: message, reason: "meta_error", failures }, 502);
    }

    await db.from("message_templates")
      .update({ otp_last_used_at: new Date().toISOString() })
      .eq("id", sentWith.templateId);

    await db.from("otp_codes").insert({ user_id: caller.id, code_hash, expires_at });

    return json({
      success: true,
      expiresAt: expires_at,
      cooldown: RESEND_COOLDOWN_SECONDS,
      today: brasiliaToday(),
      template: sentWith.templateName,
    });
  } catch (error) {
    console.error("[otp-request] exceção:", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
