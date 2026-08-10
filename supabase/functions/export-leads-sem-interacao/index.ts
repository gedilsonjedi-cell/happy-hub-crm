// Exporta leads "sem interação" (nunca clicaram nos botões-alvo de campanha) em CSV.
// Somente super_admin. Escopo estrito à organização informada (default: Zentum).
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
    let mode = url.searchParams.get("mode") || "csv";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.org) orgName = String(body.org);
        if (body?.mode) mode = String(body.mode);
      } catch (_) { /* sem body */ }
    }

    // 1) Resolver organização (case-insensitive, match exato de nome)
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
    const org = orgs[0];

    // 2) Todos os leads da org (banco interno), paginado
    type Lead = { id: string; name: string | null; phone: string | null; created_at: string };
    const leads: Lead[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("leads")
        .select("id, name, phone, created_at")
        .eq("organization_id", org.id)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as Lead[];
      leads.push(...batch);
      if (batch.length < PAGE) break;
      if (from > 500_000) break;
    }

    // 3) Mensagens inbound da org no banco EXTERNO, paginado
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) throw new Error("EXTERNAL_SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
    const ext = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const responders = new Set<string>();
    let inboundCount = 0;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await ext
        .from("whatsapp_messages")
        .select("sender_phone, message_type, content, metadata")
        .eq("organization_id", org.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as RawMsg[];
      inboundCount += batch.length;
      for (const m of batch) {
        const label = extractButtonLabel(m);
        if (!label) continue;
        if (!TARGET_BUTTONS.has(normalizeLabel(label))) continue;
        const key = phoneKey(m.sender_phone);
        if (key) responders.add(key);
      }
      if (batch.length < PAGE) break;
      if (from > 2_000_000) break;
    }

    const exported = leads.filter((l) => {
      const key = phoneKey(l.phone);
      return !key || !responders.has(key);
    });

    const totals = {
      organization: org.name,
      organization_id: org.id,
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
      "nome,telefone,criado_em,lead_id",
      ...exported.map((l) =>
        [csvCell(l.name), csvCell(l.phone), csvCell(l.created_at), csvCell(l.id)].join(",")
      ),
    ].join("\n");

    return new Response("\uFEFF" + csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads_sem_interacao_${slug}_${today}.csv"`,
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
