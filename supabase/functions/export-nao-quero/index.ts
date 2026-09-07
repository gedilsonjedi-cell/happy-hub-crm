// Exporta em CSV os leads que finalizaram a conversa por terem respondido
// "Não Quero" (clique no botão do template). Escopo: organização do usuário
// autenticado, ou a organização informada quando super_admin (impersonação).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractButtonLabel, isNotWantedLabel } from "../_shared/notWantedButton.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-total-exportados, content-disposition",
};

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
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: "Invalid authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let requestedOrgId = "";
    let dateFrom = "";
    let dateTo = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.organization_id) requestedOrgId = String(body.organization_id);
        if (body?.date_from) dateFrom = String(body.date_from);
        if (body?.date_to) dateTo = String(body.date_to);
      } catch (_) { /* sem body */ }
    }

    const { data: isSuperAdmin } = await admin.rpc("is_super_admin", { _user_id: userId });
    const { data: profile } = await admin
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();

    const orgId = isSuperAdmin
      ? (requestedOrgId || profile?.organization_id || "")
      : (profile?.organization_id || "");

    if (!orgId) {
      return new Response(JSON.stringify({ error: "Organização não encontrada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isSuperAdmin && requestedOrgId && requestedOrgId !== orgId) {
      return new Response(JSON.stringify({ error: "Sem permissão para esta organização" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await admin
      .from("organizations").select("id, name").eq("id", orgId).maybeSingle();

    // Mensagens inbound do banco EXTERNO (SSoT) com clique de botão.
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) throw new Error("EXTERNAL_SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
    const ext = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    type Row = { phone: string; name: string | null; at: string };
    const byPhone = new Map<string, Row>();
    const PAGE = 1000;

    for (let from = 0; ; from += PAGE) {
      let q = ext
        .from("whatsapp_messages")
        .select("sender_phone, sender_name, message_type, content, metadata, created_at")
        .eq("organization_id", orgId)
        .eq("direction", "inbound")
        .in("message_type", ["button", "interactive"]);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59.999Z`);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      for (const m of batch) {
        if (!isNotWantedLabel(extractButtonLabel(m as never))) continue;
        const key = phoneKey(m.sender_phone);
        if (!key) continue;
        const prev = byPhone.get(key);
        if (!prev || (m.created_at || "") > prev.at) {
          byPhone.set(key, {
            phone: m.sender_phone || "",
            name: m.sender_name || null,
            at: m.created_at || "",
          });
        }
      }
      if (batch.length < PAGE) break;
      if (from > 2_000_000) break;
    }

    // Nomes oficiais dos leads (banco interno)
    const nameByKey = new Map<string, string>();
    if (byPhone.size > 0) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("leads")
          .select("name, phone")
          .eq("organization_id", orgId)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        for (const l of batch) {
          const key = phoneKey(l.phone);
          if (key && l.name && byPhone.has(key)) nameByKey.set(key, l.name);
        }
        if (batch.length < PAGE) break;
        if (from > 500_000) break;
      }
    }

    const rows = [...byPhone.entries()]
      .map(([key, r]) => ({ ...r, name: nameByKey.get(key) || r.name || "" }))
      .sort((a, b) => (a.at < b.at ? 1 : -1));

    const today = new Date().toISOString().slice(0, 10);
    const slug = (org?.name || "org").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    const csv = [
      "nome,telefone,finalizado_em",
      ...rows.map((r) => [csvCell(r.name), csvCell(r.phone), csvCell(r.at)].join(",")),
    ].join("\n");

    return new Response("\uFEFF" + csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nao_quero_${slug}_${today}.csv"`,
        "x-total-exportados": String(rows.length),
      },
    });
  } catch (err) {
    console.error("[export-nao-quero]", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
