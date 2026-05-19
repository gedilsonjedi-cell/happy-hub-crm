// One-shot: redistribute conversation_assignments that are pending and
// unassigned (assigned_to IS NULL) by running round-robin over the sector.
// External DB is the SSoT for conversation_assignments; sector users and
// availability live on internal DB.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const organizationId: string = body.organizationId;
    const channelIds: string[] | undefined = body.channelIds;
    const sectorId: string | undefined = body.sectorId;
    const limit: number = body.limit ?? 1000;
    const dryRun: boolean = !!body.dryRun;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const internal = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const ext = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1) Fetch candidate assignments: pending/archived, no attendant
    let q = ext.from("conversation_assignments")
      .select("id, conversation_phone, sector_id, channel_id, status")
      .eq("organization_id", organizationId)
      .is("assigned_to", null)
      .in("status", ["pending", "archived"])
      .limit(limit);
    if (channelIds && channelIds.length) q = q.in("channel_id", channelIds);
    if (sectorId) q = q.eq("sector_id", sectorId);

    const { data: rows, error } = await q;
    if (error) throw error;

    // 2) Build sector → eligible users map (cache)
    const sectorCache = new Map<string, string[]>();
    async function getEligible(sId: string): Promise<string[]> {
      if (sectorCache.has(sId)) return sectorCache.get(sId)!;
      const { data: sectorUsers, error: suErr } = await internal
        .from("user_sectors").select("user_id").eq("sector_id", sId);
      if (suErr) console.error("[user_sectors error]", suErr);
      console.log(`[getEligible] sector=${sId} found ${sectorUsers?.length || 0} users`);
      const userIds = (sectorUsers || []).map((u: any) => u.user_id);
      if (userIds.length === 0) { sectorCache.set(sId, []); return []; }
      const { data: offRows } = await internal
        .from("attendant_availability")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("is_available", false)
        .in("user_id", userIds);
      const offIds = new Set((offRows || []).map((r: any) => r.user_id));
      const eligible = userIds.filter((id: string) => !offIds.has(id));
      console.log(`[getEligible] sector=${sId} eligible=${eligible.length}`);
      sectorCache.set(sId, eligible);
      return eligible;
    }

    async function pickNext(sId: string): Promise<string | null> {
      const eligible = await getEligible(sId);
      if (eligible.length === 0) return null;
      // Prefer online first
      const { data: onRows } = await internal
        .from("attendant_availability")
        .select("user_id, last_assignment_at")
        .eq("organization_id", organizationId)
        .eq("is_available", true)
        .in("user_id", eligible)
        .order("last_assignment_at", { ascending: true, nullsFirst: true });
      if (onRows && onRows.length > 0) return onRows[0].user_id;
      // Fallback: any eligible — round-robin by last_assignment_at
      const { data: all } = await internal
        .from("attendant_availability")
        .select("user_id, last_assignment_at")
        .eq("organization_id", organizationId)
        .in("user_id", eligible);
      const lastMap = new Map((all || []).map((r: any) => [r.user_id, r.last_assignment_at]));
      const sorted = [...eligible].sort((a, b) => {
        const la = lastMap.get(a); const lb = lastMap.get(b);
        if (!la && !lb) return 0; if (!la) return -1; if (!lb) return 1;
        return new Date(la).getTime() - new Date(lb).getTime();
      });
      return sorted[0];
    }

    async function bumpLast(userId: string) {
      await internal
        .from("attendant_availability")
        .update({ last_assignment_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("organization_id", organizationId);
    }

    const results: any[] = [];
    let assignedCount = 0; let skipped = 0;
    for (const row of rows || []) {
      if (!row.sector_id) { skipped++; continue; }
      const userId = await pickNext(row.sector_id);
      if (!userId) { skipped++; results.push({ phone: row.conversation_phone, reason: "no eligible user" }); continue; }
      if (!dryRun) {
        await ext.from("conversation_assignments")
          .update({ assigned_to: userId, status: "in_progress", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await bumpLast(userId);
      }
      assignedCount++;
      results.push({ phone: row.conversation_phone, userId });
    }

    return new Response(JSON.stringify({
      total: rows?.length || 0, assignedCount, skipped, dryRun, sample: results.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
