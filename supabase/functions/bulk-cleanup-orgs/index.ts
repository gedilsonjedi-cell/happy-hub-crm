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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' },
      global: { headers: { 'x-supabase-db-timeout': '120s' } }
    });

    const { org_ids } = await req.json();

    if (!org_ids || !Array.isArray(org_ids)) {
      return new Response(JSON.stringify({ error: "org_ids array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process only first org to avoid overall timeout
    const orgId = org_ids[0];
    const remaining = org_ids.slice(1);

    try {
      console.log(`Processing org: ${orgId}`);

      // Get channel IDs
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", orgId);

      const channelIds = channels?.map((c: { id: string }) => c.id) || [];

      // Delete whatsapp_messages directly by channel_id
      if (channelIds.length > 0) {
        for (const chId of channelIds) {
          const { error: msgErr, count } = await supabase
            .from("whatsapp_messages")
            .delete({ count: "exact" })
            .eq("channel_id", chId);
          
          if (msgErr) {
            console.error(`Error deleting messages for channel ${chId}:`, msgErr.message);
          } else {
            console.log(`Deleted ${count} messages for channel ${chId}`);
          }
        }
      }

      // Run cascade
      const { error } = await supabase.rpc("delete_organization_cascade", {
        _organization_id: orgId,
      });

      if (error) throw new Error(error.message || JSON.stringify(error));

      return new Response(JSON.stringify({ 
        success: true, 
        deleted: orgId,
        remaining 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`Failed: ${msg}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: msg, 
        org: orgId, 
        remaining 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
