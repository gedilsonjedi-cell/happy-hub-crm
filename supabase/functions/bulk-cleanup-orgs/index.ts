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

    const { org_id, step } = await req.json();

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentStep = step || "messages";

    if (currentStep === "messages") {
      // Delete messages in batches of 500
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", org_id);

      const channelIds = channels?.map((c: { id: string }) => c.id) || [];
      let totalDeleted = 0;

      for (const chId of channelIds) {
        // Select batch of IDs
        const { data: batch } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("channel_id", chId)
          .limit(500);

        if (batch && batch.length > 0) {
          const ids = batch.map((m: { id: string }) => m.id);
          await supabase.from("whatsapp_messages").delete().in("id", ids);
          totalDeleted += ids.length;
        }
      }

      // Check if there are more messages
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .in("channel_id", channelIds.length > 0 ? channelIds : ["none"]);

      if (count && count > 0) {
        return new Response(JSON.stringify({
          status: "in_progress",
          step: "messages",
          deleted_batch: totalDeleted,
          remaining: count,
          message: `Deletou ${totalDeleted} mensagens, faltam ${count}. Chame novamente.`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Messages done, proceed to cascade
      return new Response(JSON.stringify({
        status: "messages_done",
        step: "cascade",
        message: "Mensagens deletadas. Chame novamente com step=cascade."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (currentStep === "cascade") {
      const { error } = await supabase.rpc("delete_organization_cascade", {
        _organization_id: org_id,
      });

      if (error) {
        return new Response(JSON.stringify({
          status: "error",
          error: error.message,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        status: "done",
        message: `Organização ${org_id} excluída com sucesso.`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid step" }), {
      status: 400,
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
