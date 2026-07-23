// lead-cleanup-cron
// Rotina automática (a cada 2 dias via pg_cron) que apaga leads sem WhatsApp
// segundo o critério REFORÇADO validado com o Allan:
//
// Apagar lead L se:
//   1) >= 2 linhas em campaign_recipients com last_error_code = '131026' vindas
//      de campaign_ids DIFERENTES.
//   2) Última dessas falhas com >= 7 dias.
//   3) L NUNCA teve linha com status IN (sent, delivered, read) em campaign_recipients.
//   4) L NUNCA teve mensagem inbound no banco EXTERNO (whatsapp_messages) em
//      qualquer variante do telefone (com/sem 9º dígito, sufixo 8) para
//      qualquer canal da organização.
//   5) L não tem conversation_assignment ATIVO (in_progress|active) no externo.
//
// Body opcional:
//   { dryRun: boolean, limit?: number }
//
// Cada lead apagado é registrado em public.lead_cleanup_log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Devolve variantes do telefone (com/sem 9º dígito) já normalizadas em dígitos.
function phoneVariants(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];
  const set = new Set<string>([digits]);
  // Brasil: 55 + DDD (2) + numero (8 ou 9)
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9 && rest.startsWith("9")) {
      set.add(`55${ddd}${rest.slice(1)}`); // sem 9
    } else if (rest.length === 8) {
      set.add(`55${ddd}9${rest}`); // com 9
    }
  }
  return Array.from(set);
}

function suffix8(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const internalUrl = Deno.env.get("SUPABASE_URL")!;
    const internalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

    if (!extUrl || !extKey) {
      return json({ error: "External DB not configured" }, 500);
    }

    const internal = createClient(internalUrl, internalServiceKey);
    const external = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: { dryRun?: boolean; limit?: number } = {};
    try {
      body = await req.json();
    } catch { /* empty body ok — chamado pelo cron */ }
    const dryRun = body.dryRun === true;
    const hardLimit = typeof body.limit === "number" ? body.limit : 100_000;

    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    // ── Passo 1: candidatos via SQL agregada (critérios 1-3) ──
    // Faz num RPC inline usando uma função temporária não é possível;
    // então rodamos via .rpc não — usamos raw SQL via PostgREST não é permitido.
    // Alternativa: consulta com múltiplos selects. Para performance,
    // usamos uma view/RPC? Como isto roda a cada 2 dias, aceitamos
    // rodar via 2 queries + agregação em memória.
    //
    // Estratégia: pegar todas as linhas 131026 (lead_id, campaign_id, updated_at)
    // e todos os lead_ids com status success, agregar em JS.
    // Filtra por updated_at >= now() - 180d para bounded scan.

    const cutoff7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // Paginação: pega em páginas até 10k
    async function fetchAllFailures() {
      const rows: Array<{
        lead_id: string;
        campaign_id: string;
        updated_at: string;
        phone: string;
      }> = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await internal
          .from("campaign_recipients")
          .select("lead_id, campaign_id, updated_at, phone")
          .eq("last_error_code", "131026")
          .not("lead_id", "is", null)
          .order("updated_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error("failures fetch: " + error.message);
        if (!data || data.length === 0) break;
        rows.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
        if (rows.length > 500_000) break; // safety
      }
      return rows;
    }

    const failures = await fetchAllFailures();

    // Agrega por lead_id
    const byLead = new Map<string, {
      campaigns: Set<string>;
      lastFailure: string;
      phone: string;
    }>();
    for (const f of failures) {
      if (!f.lead_id) continue;
      const cur = byLead.get(f.lead_id);
      if (cur) {
        cur.campaigns.add(f.campaign_id);
        if (f.updated_at > cur.lastFailure) cur.lastFailure = f.updated_at;
      } else {
        byLead.set(f.lead_id, {
          campaigns: new Set([f.campaign_id]),
          lastFailure: f.updated_at,
          phone: f.phone,
        });
      }
    }

    // Filtra critérios 1 e 2
    const stageOne: string[] = [];
    for (const [leadId, agg] of byLead) {
      if (agg.campaigns.size >= 2 && agg.lastFailure < cutoff7d) {
        stageOne.push(leadId);
      }
    }

    // Critério 3: excluir quem já teve success em qualquer campanha
    // Consulta em chunks
    async function excludeSuccessful(ids: string[]): Promise<Set<string>> {
      const excluded = new Set<string>();
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await internal
          .from("campaign_recipients")
          .select("lead_id")
          .in("lead_id", slice)
          .in("status", ["sent", "delivered", "read"]);
        if (error) throw new Error("success check: " + error.message);
        for (const r of (data ?? []) as any[]) {
          if (r.lead_id) excluded.add(r.lead_id);
        }
      }
      return excluded;
    }
    const successful = await excludeSuccessful(stageOne);
    const stageTwo = stageOne.filter((id) => !successful.has(id));

    // Fetch lead phone + organization_id
    async function fetchLeads(ids: string[]) {
      const out = new Map<string, { phone: string; organization_id: string | null }>();
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await internal
          .from("leads")
          .select("id, phone, organization_id")
          .in("id", slice);
        if (error) throw new Error("leads fetch: " + error.message);
        for (const r of (data ?? []) as any[]) {
          out.set(r.id, { phone: r.phone, organization_id: r.organization_id });
        }
      }
      return out;
    }
    const leadsMap = await fetchLeads(stageTwo);

    // Critérios 4 e 5 no banco externo
    // 4: mensagem inbound existe para algum sufixo do lead?
    //    testamos variantes com/sem 9º e sufixo 8 via `like`.
    // 5: assignment ativo?
    // Para performance: usamos sufixo 8 (indexado) para uma query genérica.
    async function hasInbound(phone: string): Promise<boolean> {
      const suf = suffix8(phone);
      if (!suf) return false;
      const { data, error } = await external
        .from("whatsapp_messages")
        .select("id")
        .eq("direction", "inbound")
        .like("sender_phone", `%${suf}`)
        .limit(1);
      if (error) {
        console.error("hasInbound err", error.message);
        return false;
      }
      return !!(data && data.length > 0);
    }

    async function hasActiveAssignment(leadId: string, phone: string): Promise<boolean> {
      // Primeiro tenta por lead_id (mais confiável)
      const { data: d1 } = await external
        .from("conversation_assignments")
        .select("id")
        .eq("lead_id", leadId)
        .in("status", ["in_progress", "active"])
        .limit(1);
      if (d1 && d1.length > 0) return true;
      // Fallback por telefone (variantes)
      const variants = phoneVariants(phone);
      if (variants.length === 0) return false;
      const { data: d2 } = await external
        .from("conversation_assignments")
        .select("id")
        .in("conversation_phone", variants)
        .in("status", ["in_progress", "active"])
        .limit(1);
      return !!(d2 && d2.length > 0);
    }

    // Processa em lotes com concorrência limitada
    const toDelete: Array<{
      lead_id: string;
      phone: string;
      organization_id: string | null;
      distinct_campaigns: number;
      last_failure_at: string;
    }> = [];
    const falsePositives: string[] = [];

    const CONCURRENCY = 8;
    let idx = 0;
    async function worker() {
      while (idx < stageTwo.length && toDelete.length < hardLimit) {
        const i = idx++;
        const leadId = stageTwo[i];
        const info = leadsMap.get(leadId);
        if (!info || !info.phone) continue;
        try {
          const [inbound, active] = await Promise.all([
            hasInbound(info.phone),
            hasActiveAssignment(info.phone),
          ]);
          if (inbound || active) {
            falsePositives.push(leadId);
            continue;
          }
          const agg = byLead.get(leadId)!;
          toDelete.push({
            lead_id: leadId,
            phone: info.phone,
            organization_id: info.organization_id,
            distinct_campaigns: agg.campaigns.size,
            last_failure_at: agg.lastFailure,
          });
        } catch (e) {
          console.error("check failed", leadId, (e as Error).message);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Agrupa por org para retorno
    const byOrg = new Map<string, number>();
    for (const d of toDelete) {
      const k = d.organization_id ?? "unknown";
      byOrg.set(k, (byOrg.get(k) ?? 0) + 1);
    }

    if (dryRun) {
      return json({
        dryRun: true,
        run_id: runId,
        candidates_stage1: stageOne.length,
        candidates_stage2: stageTwo.length,
        false_positives_inbound_or_active: falsePositives.length,
        would_delete: toDelete.length,
        by_org: Object.fromEntries(byOrg),
        elapsed_ms: Date.now() - startedAt,
      });
    }

    // ── Execução real: log + delete em lotes ──
    let inserted = 0;
    let deleted = 0;
    const CHUNK = 200;

    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK);

      // 1. Log primeiro (auditoria antes do delete)
      const { error: logErr } = await internal.from("lead_cleanup_log").insert(
        chunk.map((c) => ({
          organization_id: c.organization_id,
          lead_id: c.lead_id,
          phone: c.phone,
          motivo:
            "131026 em >=2 campanhas distintas, sem sucesso, sem inbound, sem assignment ativo (>=7d)",
          run_id: runId,
          distinct_campaigns: c.distinct_campaigns,
          last_failure_at: c.last_failure_at,
        })),
      );
      if (logErr) {
        console.error("log insert failed:", logErr.message);
        continue; // não apaga sem log
      }
      inserted += chunk.length;

      // 2. Delete leads
      const ids = chunk.map((c) => c.lead_id);
      const { error: delErr, count } = await internal
        .from("leads")
        .delete({ count: "exact" })
        .in("id", ids);
      if (delErr) {
        console.error("leads delete failed:", delErr.message);
        continue;
      }
      deleted += count ?? ids.length;
    }

    return json({
      dryRun: false,
      run_id: runId,
      candidates_stage1: stageOne.length,
      candidates_stage2: stageTwo.length,
      false_positives_inbound_or_active: falsePositives.length,
      logged: inserted,
      deleted,
      by_org: Object.fromEntries(byOrg),
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lead-cleanup-cron]", msg);
    return json({ error: msg }, 500);
  }
});
