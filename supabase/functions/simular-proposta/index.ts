// Edge Function: simular-proposta
// Restrita à organização "Optimus Admin" (canal de testes).
// Recebe { phone, organizationId } do frontend, busca o CPF do lead e
// chama o webhook externo de simulação, que dispara a imagem direto pro cliente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPTIMUS_ADMIN_ORG_ID = "fe6a8da0-8f0a-4887-8c2c-f7ed6e5cd0b0";
const SIMULATION_WEBHOOK_URL =
  "https://weebkarasek.farolbase.com/webhook/simuladorjoinbankwxconsit";

function onlyDigits(v: string | null | undefined): string {
  return (v || "").replace(/\D/g, "");
}

function extractCpfFromCustomFields(cf: unknown): string | null {
  if (!cf || typeof cf !== "object") return null;
  const obj = cf as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (/cpf|documento|document/i.test(key)) {
      const val = obj[key];
      if (typeof val === "string" || typeof val === "number") {
        const digits = onlyDigits(String(val));
        if (digits.length >= 11) return digits.slice(0, 11);
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, organizationId } = await req.json();

    if (!phone || !organizationId) {
      return new Response(
        JSON.stringify({ error: "phone e organizationId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (organizationId !== OPTIMUS_ADMIN_ORG_ID) {
      return new Response(
        JSON.stringify({ error: "Recurso disponível apenas para organização de testes" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Tenta achar lead pelo telefone (8 últimos dígitos pra cobrir variações com/sem 9)
    const phoneDigits = onlyDigits(phone);
    const suffix = phoneDigits.slice(-8);

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, name, phone, document, custom_fields")
      .eq("organization_id", organizationId)
      .ilike("phone", `%${suffix}%`)
      .limit(5);

    if (leadsError) {
      console.error("[simular-proposta] erro ao buscar lead:", leadsError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar lead", details: leadsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lead = (leads || [])[0];
    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead não encontrado para este telefone" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cpf =
      onlyDigits(lead.document).length >= 11
        ? onlyDigits(lead.document).slice(0, 11)
        : extractCpfFromCustomFields(lead.custom_fields);

    if (!cpf) {
      return new Response(
        JSON.stringify({
          error: "CPF não cadastrado para este lead. Atualize o cadastro antes de simular.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Envia o payload com TODAS as variantes de nome de campo possíveis,
    // já que não temos doc do webhook concorrente. O n8n simplesmente
    // ignora os campos que não usa.
    const telefoneSem55 = phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
    const payload = {
      cpf,
      documento: cpf,
      document: cpf,
      telefone: phoneDigits,
      numero: phoneDigits,
      phone: phoneDigits,
      celular: phoneDigits,
      whatsapp: phoneDigits,
      telefone_sem_ddi: telefoneSem55,
      nome: lead.name || null,
      name: lead.name || null,
      cliente: lead.name || null,
    };

    // Dispara em paralelo 3 variações para maximizar a chance de o n8n aceitar:
    // 1) POST JSON (todos os field aliases)
    // 2) POST application/x-www-form-urlencoded
    // 3) GET com query string
    const qs = new URLSearchParams({
      cpf,
      telefone: phoneDigits,
      nome: lead.name || "",
    }).toString();

    const formBody = new URLSearchParams(
      Object.entries(payload).reduce<Record<string, string>>((acc, [k, v]) => {
        if (v != null) acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();

    console.log("[simular-proposta] enviando webhook (json+form+get):", payload);

    const [jsonResp, formResp, getResp] = await Promise.allSettled([
      fetch(SIMULATION_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      fetch(SIMULATION_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      }),
      fetch(`${SIMULATION_WEBHOOK_URL}?${qs}`, { method: "GET" }),
    ]);

    const summarize = async (label: string, r: PromiseSettledResult<Response>) => {
      if (r.status === "rejected") return { label, error: String(r.reason) };
      const status = r.value.status;
      const text = await r.value.text().catch(() => "");
      console.log(`[simular-proposta] ${label} status:`, status, text.slice(0, 300));
      return { label, status, body: text.slice(0, 300) };
    };

    const results = await Promise.all([
      summarize("json", jsonResp),
      summarize("form", formResp),
      summarize("get", getResp),
    ]);

    const anyOk = results.some((r) => "status" in r && r.status && r.status < 400);

    if (!anyOk) {
      return new Response(
        JSON.stringify({ error: "Nenhuma variação do webhook aceitou", results }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, cpf_used: cpf, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[simular-proposta] erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
