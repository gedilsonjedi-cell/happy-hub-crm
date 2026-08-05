// Webhook de ENTRADA (captação de leads via formulário).
// URL pública: /functions/v1/lead-webhook/{token}
// Cria/atualiza o lead, aplica tags automáticas e (opcional) dispara um template.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Payload = Record<string, unknown>;

function pick(payload: Payload, keys: string[]): string | undefined {
  for (const k of Object.keys(payload)) {
    if (keys.includes(k.toLowerCase().trim())) {
      const v = payload[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return undefined;
}

function formatPhone(raw: string): string {
  let cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith("55") && cleaned.length <= 11) cleaned = "55" + cleaned;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const token = parts[parts.length - 1];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!token || token === "lead-webhook") {
    return json({ success: false, error: "Token não informado. Use /lead-webhook/{token}" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Payload flexível: JSON, form-urlencoded, multipart ou query string
    let payload: Payload = {};
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = (await req.json().catch(() => ({}))) as Payload;
      } else {
        const form = await req.formData().catch(() => null);
        if (form) for (const [k, v] of form.entries()) payload[k] = v;
      }
    }
    for (const [k, v] of url.searchParams.entries()) {
      if (payload[k] === undefined) payload[k] = v;
    }

    // Alguns formulários aninham os campos em "data" / "fields" / "body"
    for (const nested of ["data", "fields", "body", "payload"]) {
      const inner = payload[nested];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        payload = { ...(inner as Payload), ...payload };
      }
    }

    const { data: config, error: configError } = await supabase
      .from("inbound_webhooks")
      .select("*, template:message_templates(id, name, variables), channel:channels(id, organization_id)")
      .eq("token", token)
      .maybeSingle();

    if (configError || !config) {
      return json({ success: false, error: "Webhook não encontrado" }, 404);
    }
    if (!config.is_active) {
      return json({ success: false, error: "Webhook desativado" }, 403);
    }

    const organizationId = config.organization_id as string;

    const rawPhone = pick(payload, [
      "phone", "telefone", "celular", "whatsapp", "numero", "número",
      "phone_number", "telephone", "tel", "fone", "contato",
    ]);
    const name = pick(payload, ["name", "nome", "full_name", "nome_completo", "first_name", "cliente"]);
    const email = pick(payload, ["email", "e-mail", "e_mail", "mail"]);

    const log = async (fields: Record<string, unknown>) => {
      await supabase.from("inbound_webhook_logs").insert({
        webhook_id: config.id,
        organization_id: organizationId,
        phone: rawPhone ? formatPhone(rawPhone) : null,
        name: name ?? null,
        payload,
        ...fields,
      });
    };

    if (!rawPhone) {
      await log({ error_message: "Telefone não informado no payload" });
      return json(
        { success: false, error: "Telefone não informado. Envie um campo 'phone', 'telefone', 'celular' ou 'whatsapp'." },
        400,
      );
    }

    const phone = formatPhone(rawPhone);
    if (phone.length < 12) {
      await log({ error_message: `Telefone inválido: ${phone}` });
      return json({ success: false, error: "Telefone inválido" }, 400);
    }

    const process = async () => {
      let leadCreated = false;
      let templateSent = false;
      let errorMessage: string | null = null;

      try {
        const tags: string[] = Array.isArray(config.tags) ? (config.tags as string[]) : [];

        if (config.create_lead) {
          const suffix = phone.slice(-8);
          const { data: existing } = await supabase
            .from("leads")
            .select("id, tags, name, email")
            .eq("organization_id", organizationId)
            .like("phone", `%${suffix}`)
            .limit(1)
            .maybeSingle();

          if (existing) {
            const merged = Array.from(new Set([...(existing.tags || []), ...tags]));
            await supabase
              .from("leads")
              .update({
                tags: merged,
                name: existing.name && !existing.name.startsWith("Lead ") ? existing.name : (name || existing.name),
                email: existing.email || email || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("organization_id", organizationId)
              .limit(1)
              .maybeSingle();

            const { error: insertError } = await supabase.from("leads").insert({
              organization_id: organizationId,
              user_id: config.created_by || profile?.id,
              phone,
              name: name || `Lead ${phone}`,
              email: email || null,
              tags,
              status: "new",
              notes: `Lead recebido via webhook "${config.name}" em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
              custom_fields: payload,
            });
            if (insertError) {
              errorMessage = `Erro ao criar lead: ${insertError.message}`;
            } else {
              leadCreated = true;
            }
          }
        }

        if (config.auto_dispatch && config.channel_id && config.template) {
          const template = config.template as { name: string; variables?: string[] };
          const templateParams = (template.variables || []).map((v: string) => {
            const fromPayload = pick(payload, [String(v).toLowerCase()]);
            if (fromPayload) return fromPayload;
            if (/nome|name/i.test(v)) return name || "Cliente";
            return v;
          });

          const res = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              channelId: config.channel_id,
              destination: phone,
              templateName: template.name,
              templateParams: templateParams.length > 0 ? templateParams : undefined,
              templateLanguage: "pt_BR",
              source: "inbound_webhook",
            }),
          });
          const result = await res.json().catch(() => ({}));
          if (result?.success) {
            templateSent = true;
          } else {
            errorMessage = result?.error || result?.message || `Falha no disparo (HTTP ${res.status})`;
          }
        } else if (config.auto_dispatch) {
          errorMessage = "Disparo automático ativo, mas canal ou template não configurado";
        }
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : String(e);
      }

      await log({ lead_created: leadCreated, template_sent: templateSent, error_message: errorMessage });
    };

    // @ts-ignore EdgeRuntime é fornecido pelo Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(process());
    } else {
      process();
    }

    return json({ success: true, phone, received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[lead-webhook] Error:", error);
    return json({ success: false, error: message }, 500);
  }
});
