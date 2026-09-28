// Fila de espera por departamento: conversas PENDENTES, com departamento e
// sem dono, são entregues a um atendente ONLINE do departamento (round-robin).
// Sem ninguém online, continuam na fila. Roda a cada minuto via cron e é
// idempotente (só age sobre status='pending', nunca sobre placeholders
// 'archived' de campanha que o lead ainda não respondeu).
import { createClient } from "npm:@supabase/supabase-js@2";
import { getNextAvailableAttendant } from "../_shared/assignment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: { organizationId?: string; dryRun?: boolean } = {};
    try { body = await req.json(); } catch { /* sem corpo */ }
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;
    const dryRun = !!body.dryRun;

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let q = db.from("conversation_assignments")
      .select("id, organization_id, sector_id, conversation_phone")
      .eq("status", "pending")
      .is("assigned_to", null)
      .not("sector_id", "is", null)
      .not("organization_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(500);
    if (organizationId) q = q.eq("organization_id", organizationId);

    const { data: rows, error } = await q;
    if (error) throw error;

    let assigned = 0, waiting = 0;
    for (const row of rows || []) {
      if (dryRun) continue;
      const next = await getNextAvailableAttendant(db, row.organization_id, row.sector_id);
      if (!next) { waiting++; continue; }
      const { data: upd } = await db.from("conversation_assignments")
        .update({ assigned_to: next.userId, assigned_at: new Date().toISOString(), status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", row.id).is("assigned_to", null).eq("status", "pending")
        .select("id");
      if (upd?.length) assigned++;
    }

    return new Response(JSON.stringify({ total: rows?.length || 0, assigned, waiting, dryRun }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
