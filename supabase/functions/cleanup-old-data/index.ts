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
    
    // Calculate the cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffISO = cutoffDate.toISOString();
    
    console.log(`[Cleanup] Starting cleanup for data older than ${cutoffISO}`);
    
    const results = {
      whatsapp_messages: 0,
      campaign_recipients: 0,
      campaigns: 0,
      conversation_notes: 0,
      conversation_memory: 0,
      flow_sessions: 0,
    };

    // 1. Delete old WhatsApp messages
    const { error: msgError, count: msgCount } = await supabase
      .from("whatsapp_messages")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);
    
    if (msgError) {
      console.error("[Cleanup] Error deleting whatsapp_messages:", msgError);
    } else {
      results.whatsapp_messages = msgCount || 0;
      console.log(`[Cleanup] Deleted ${msgCount} whatsapp_messages`);
    }

    // 2. Delete old campaign recipients (only from completed campaigns)
    const { error: recipError, count: recipCount } = await supabase
      .from("campaign_recipients")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);
    
    if (recipError) {
      console.error("[Cleanup] Error deleting campaign_recipients:", recipError);
    } else {
      results.campaign_recipients = recipCount || 0;
      console.log(`[Cleanup] Deleted ${recipCount} campaign_recipients`);
    }

    // 3. Delete old completed campaigns (only completed ones older than 7 days)
    const { error: campError, count: campCount } = await supabase
      .from("campaigns")
      .delete({ count: "exact" })
      .eq("status", "completed")
      .lt("completed_at", cutoffISO);
    
    if (campError) {
      console.error("[Cleanup] Error deleting campaigns:", campError);
    } else {
      results.campaigns = campCount || 0;
      console.log(`[Cleanup] Deleted ${campCount} campaigns`);
    }

    // 4. Delete old conversation notes
    const { error: notesError, count: notesCount } = await supabase
      .from("conversation_notes")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);
    
    if (notesError) {
      console.error("[Cleanup] Error deleting conversation_notes:", notesError);
    } else {
      results.conversation_notes = notesCount || 0;
      console.log(`[Cleanup] Deleted ${notesCount} conversation_notes`);
    }

    // 5. Delete expired conversation memory
    const { error: memError, count: memCount } = await supabase
      .from("conversation_memory")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());
    
    if (memError) {
      console.error("[Cleanup] Error deleting conversation_memory:", memError);
    } else {
      results.conversation_memory = memCount || 0;
      console.log(`[Cleanup] Deleted ${memCount} conversation_memory`);
    }

    // 6. Delete old flow sessions
    const { error: flowError, count: flowCount } = await supabase
      .from("flow_sessions")
      .delete({ count: "exact" })
      .lt("updated_at", cutoffISO);
    
    if (flowError) {
      console.error("[Cleanup] Error deleting flow_sessions:", flowError);
    } else {
      results.flow_sessions = flowCount || 0;
      console.log(`[Cleanup] Deleted ${flowCount} flow_sessions`);
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[Cleanup] Total records deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup completed. Deleted ${totalDeleted} records.`,
        details: results,
        cutoff_date: cutoffISO,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cleanup] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
