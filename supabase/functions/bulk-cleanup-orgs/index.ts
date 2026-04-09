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
        console.log(`Deleting org: ${orgId}`);
        const { data, error } = await supabase.rpc("delete_organization_cascade", {
          _organization_id: orgId,
        });

        if (error) throw error;
        results.push({ id: orgId, success: true });
        console.log(`Successfully deleted org: ${orgId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
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
