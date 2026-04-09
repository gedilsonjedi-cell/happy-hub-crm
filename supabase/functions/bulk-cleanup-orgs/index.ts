import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { org_ids } = await req.json();

    if (!org_ids || !Array.isArray(org_ids)) {
      return new Response(JSON.stringify({ error: "org_ids array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const orgId of org_ids) {
      try {
        console.log(`Processing org: ${orgId}`);

        // 1. Get channel IDs
        const { data: channels } = await supabase
          .from("channels")
          .select("id")
          .eq("organization_id", orgId);

        const channelIds = channels?.map((c: { id: string }) => c.id) || [];

        // 2. Delete whatsapp_messages in batches (heaviest table)
        if (channelIds.length > 0) {
          for (const chId of channelIds) {
            let deleted = true;
            while (deleted) {
              const { data: batch } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("channel_id", chId)
                .limit(1000);

              if (!batch || batch.length === 0) {
                deleted = false;
                break;
              }

              const ids = batch.map((m: { id: string }) => m.id);
              await supabase.from("whatsapp_messages").delete().in("id", ids);
              console.log(`Deleted ${ids.length} messages for channel ${chId}`);
            }
          }
        }

        // 3. Now run cascade (messages already cleared)
        const { error } = await supabase.rpc("delete_organization_cascade", {
          _organization_id: orgId,
        });

        if (error) throw new Error(error.message || JSON.stringify(error));
        results.push({ id: orgId, success: true });
        console.log(`Successfully deleted org: ${orgId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error(`Failed to delete org ${orgId}:`, msg);
        results.push({ id: orgId, success: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
