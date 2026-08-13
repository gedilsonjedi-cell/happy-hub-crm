// Exporta leads de uma organização em CSV.
// Modos: "sem interação" (nunca clicaram nos botões-alvo) ou "base toda".
// Filtro de período por data de criação do lead ou por última interação (inbound no DB externo).
// Somente super_admin. Escopo estrito à organização informada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-total-leads, x-total-respondentes, x-total-exportados, content-disposition",
};

interface RawMsg {
  sender_phone: string | null;
  message_type: string | null;
  content: string | null;
  metadata: any;
  created_at?: string | null;
}

// Cópia fiel de extractButtonLabel() de src/hooks/useConversationHeatmap.tsx
// (edge functions não podem importar de src/).
function extractButtonLabel(m: RawMsg): string | null {
  const md = m.metadata || {};
  return (
    md.button_text ||
    md.title ||
    md?.interactive?.button_reply?.title ||
    (m.message_type === "button" || m.message_type === "interactive" ? m.content || null : null) ||
    null
  );
}

const normalizeLabel = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

const TARGET_BUTTONS = new Set(
  ["Quero Consultar", "Não Quero Consultar", "Consultar", "Não Quero"].map(normalizeLabel),
);

const phoneKey = (p?: string | null) => {
  const d = (p || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : "";
};

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    const isServiceRoleCall = authHeader === `Bearer ${serviceKey}`;

    if (!isServiceRoleCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await anon.auth.getClaims(
        authHeader.replace("Bearer ", ""),
      );
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Invalid authorization" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isSuperAdmin } = await admin.rpc("is_super_admin", {
        _user_id: claimsData.claims.sub,
      });
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super admins can perform this action" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const url = new URL(req.url);
    let orgName = url.searchParams.get("org") || "Zentum";
    let orgId = url.searchParams.get("organization_id") || "";
    let mode = url.searchParams.get("mode") || "csv";
    let exportType = url.searchParams.get("export_type") || "sem_interacao"; // sem_interacao | base_toda
    let dateField = url.searchParams.get("date_field") || "created"; // created | last_interaction
    let dateFrom = url.searchParams.get("date_from") || "";
    let dateTo = url.searchParams.get("date_to") || "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.org) orgName = String(body.org);
        if (body?.organization_id) orgId = String(body.organization_id);
        if (body?.mode) mode = String(body.mode);
        if (body?.export_type) exportType = String(body.export_type);
        if (body?.date_field) dateField = String(body.date_field);
        if (body?.date_from) dateFrom = String(body.date_from);
        if (body?.date_to) dateTo = String(body.date_to);
      } catch (_) { /* sem body */ }
    }
    if (exportType !== "base_toda") exportType = "sem_interacao";
    if (dateField !== "last_interaction") dateField = "created";

    // Datas (YYYY-MM-DD -> limites do dia em UTC)
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).getTime() : null;
    const inRange = (iso?: string | null) => {
      if (fromTs === null && toTs === null) return true;
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return false;
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
      return true;
    };

    // 1) Resolver organização: por ID (preferencial) ou por nome (fallback)
    let org: { id: string; name: string };
    if (orgId) {
      const { data, error } = await admin
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ error: `Organização "${orgId}" não encontrada` }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      org = data;
    } else {
      let { data: orgs, error: orgErr } = await admin
        .from("organizations")
        .select("id, name")
        .ilike("name", orgName);
      if (orgErr) throw orgErr;
      // Fallback: match por conteúdo quando não há nome exato (ex.: "Zentum" -> "Zentum Soluçoes")
      if (!orgs || orgs.length === 0) {
        const res = await admin
          .from("organizations")
          .select("id, name")
          .ilike("name", `%${orgName}%`);
        if (res.error) throw res.error;
        orgs = res.data;
      }
      if (!orgs || orgs.length === 0) {
        return new Response(JSON.stringify({ error: `Organização "${orgName}" não encontrada` }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (orgs.length > 1) {
        return new Response(
          JSON.stringify({ error: `Mais de uma organização com o nome "${orgName}"`, matches: orgs }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      org = orgs[0];
    }


    // 2) Todos os leads da org (banco interno), paginado
    type Lead = { id: string; name: string | null; phone: string | null; created_at: string };
    const leads: Lead[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let q = admin
        .from("leads")
        .select("id, name, phone, created_at")
        .eq("organization_id", org.id);
      if (dateField === "created") {
        if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00.000Z`);
        if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59.999Z`);
      }
      const { data, error } = await q
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as Lead[];
      leads.push(...batch);
      if (batch.length < PAGE) break;
      if (from > 500_000) break;
    }

    // 3) Mensagens inbound da org no banco EXTERNO, paginado.
    // Necessário para: (a) identificar respondentes de botão (export_type=sem_interacao)
    // e (b) calcular a última interação por telefone (date_field=last_interaction).
    const needInbound = exportType === "sem_interacao" || dateField === "last_interaction";
    const responders = new Set<string>();
    const lastInteraction = new Map<string, string>();
    let inboundCount = 0;

    if (needInbound) {
      const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
      const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
      if (!extUrl || !extKey) throw new Error("EXTERNAL_SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
      const ext = createClient(extUrl, extKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      for (let from = 0; ; from += PAGE) {
        const { data, error } = await ext
          .from("whatsapp_messages")
          .select("sender_phone, message_type, content, metadata, created_at")
          .eq("organization_id", org.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as RawMsg[];
        inboundCount += batch.length;
        for (const m of batch) {
          const key = phoneKey(m.sender_phone);
          if (key && m.created_at) {
            const prev = lastInteraction.get(key);
            if (!prev || m.created_at > prev) lastInteraction.set(key, m.created_at);
          }
          if (exportType === "sem_interacao") {
            const label = extractButtonLabel(m);
            if (!label) continue;
            if (!TARGET_BUTTONS.has(normalizeLabel(label))) continue;
            if (key) responders.add(key);
          }
        }
        if (batch.length < PAGE) break;
        if (from > 2_000_000) break;
      }
    }

    const exported = leads.filter((l) => {
      const key = phoneKey(l.phone);
      if (exportType === "sem_interacao" && key && responders.has(key)) return false;
      if (dateField === "last_interaction") {
        if (!inRange(key ? lastInteraction.get(key) : null)) return false;
      }
      return true;
    });

    const totals = {
      organization: org.name,
      organization_id: org.id,
      export_type: exportType,
      date_field: dateField,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      total_leads: leads.length,
      total_inbound_mensagens: inboundCount,
      total_respondentes: responders.size,
      total_exportados: exported.length,
    };

    if (mode === "count") {
      return new Response(JSON.stringify(totals), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const slug = org.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const csv = [
      "nome,telefone,criado_em,ultima_interacao,lead_id",
      ...exported.map((l) =>
        [
          csvCell(l.name),
          csvCell(l.phone),
          csvCell(l.created_at),
          csvCell(lastInteraction.get(phoneKey(l.phone)) || ""),
          csvCell(l.id),
        ].join(",")
      ),
    ].join("\n");

    const fileTag = exportType === "base_toda" ? "base_toda" : "sem_interacao";
    return new Response("\uFEFF" + csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads_${fileTag}_${slug}_${today}.csv"`,
        "x-total-leads": String(totals.total_leads),
        "x-total-respondentes": String(totals.total_respondentes),
        "x-total-exportados": String(totals.total_exportados),
      },
    });
  } catch (err) {
    console.error("[export-leads-sem-interacao]", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
