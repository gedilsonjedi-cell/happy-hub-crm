// One-off admin: repoint conversation history (messages, contacts, assignments, stats)
// from old channel_ids to a new active channel_id on the EXTERNAL Supabase DB.
//
// POST { fromChannelIds: string[], toChannelId: string, organizationId: string, dryRun?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const fromChannelIds: string[] = body.fromChannelIds ?? [];
    const toChannelId: string = body.toChannelId;
    const organizationId: string = body.organizationId;
    const dryRun: boolean = !!body.dryRun;

    if (!fromChannelIds.length || !toChannelId || !organizationId) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const counts: Record<string, any> = {};

    // Count before
    for (const t of ["whatsapp_messages", "whatsapp_contacts", "conversation_assignments", "conversation_stats"]) {
      const { count } = await ext.from(t).select("*", { count: "exact", head: true }).in("channel_id", fromChannelIds);
      counts[`${t}_before`] = count ?? 0;
    }

    if (dryRun) {
      return new Response(JSON.stringify({ dryRun: true, counts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};
    for (const t of ["whatsapp_messages", "whatsapp_contacts", "conversation_assignments", "conversation_stats"]) {
      const { error, count } = await ext
        .from(t)
        .update({ channel_id: toChannelId, organization_id: organizationId }, { count: "exact" })
        .in("channel_id", fromChannelIds)
        .select("id", { count: "exact", head: true });
      results[t] = { updated: count ?? 0, error: error?.message ?? null };
    }

    return new Response(JSON.stringify({ counts, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
