import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function batchDelete(supabase: any, table: string, column: string, values: string[], batchSize = 500) {
  let totalDeleted = 0;
  for (let i = 0; i < values.length; i += batchSize) {
    const chunk = values.slice(i, i + batchSize);
    const { count } = await supabase.from(table).delete({ count: "exact" }).in(column, chunk);
    totalDeleted += count || 0;
  }
  return totalDeleted;
}

async function batchDeleteByEq(supabase: any, table: string, column: string, value: string) {
  let total = 0;
  while (true) {
    const { data } = await supabase.from(table).select("id").eq(column, value).limit(500);
    if (!data || data.length === 0) break;
    const ids = data.map((r: { id: string }) => r.id);
    await supabase.from(table).delete().in("id", ids);
    total += ids.length;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { org_id, step } = await req.json();

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const s = step || "cleanup";
    const log: string[] = [];

    if (s === "cleanup") {
      // Get channel IDs
      const { data: channels } = await supabase.from("channels").select("id").eq("organization_id", org_id);
      const chIds = channels?.map((c: { id: string }) => c.id) || [];

      // Delete whatsapp_messages by channel
      if (chIds.length > 0) {
        for (const chId of chIds) {
          const n = await batchDeleteByEq(supabase, "whatsapp_messages", "channel_id", chId);
          if (n > 0) log.push(`whatsapp_messages: ${n} (ch: ${chId})`);
        }
        // conversation_assignments
        for (const chId of chIds) {
          const n = await batchDeleteByEq(supabase, "conversation_assignments", "channel_id", chId);
          if (n > 0) log.push(`conversation_assignments: ${n}`);
        }
      }

      // Delete leads in batches
      const leadsN = await batchDeleteByEq(supabase, "leads", "organization_id", org_id);
      if (leadsN > 0) log.push(`leads: ${leadsN}`);

      // Delete balance_transactions
      const btN = await batchDeleteByEq(supabase, "balance_transactions", "organization_id", org_id);
      if (btN > 0) log.push(`balance_transactions: ${btN}`);

      // Check remaining leads
      const { count: remainingLeads } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org_id);

      if (remainingLeads && remainingLeads > 0) {
        return new Response(JSON.stringify({
          status: "in_progress", log, remaining_leads: remainingLeads,
          message: "Ainda há dados. Chame novamente com step=cleanup."
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        status: "ready", log,
        message: "Dados pesados limpos. Chame com step=cascade."
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (s === "cascade") {
      const { error } = await supabase.rpc("delete_organization_cascade", { _organization_id: org_id });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ status: "done", message: `Org ${org_id} excluída.` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid step" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
