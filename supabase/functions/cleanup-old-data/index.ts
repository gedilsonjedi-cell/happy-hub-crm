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
    
    // Calculate cutoff dates
    const cutoff7Days = new Date();
    cutoff7Days.setDate(cutoff7Days.getDate() - 7);
    const cutoff7DaysISO = cutoff7Days.toISOString();

    const cutoff30Days = new Date();
    cutoff30Days.setDate(cutoff30Days.getDate() - 30);
    const cutoff30DaysISO = cutoff30Days.toISOString();

    const cutoff90Days = new Date();
    cutoff90Days.setDate(cutoff90Days.getDate() - 90);
    const cutoff90DaysISO = cutoff90Days.toISOString();
    
    console.log(`[Cleanup] Starting optimized cleanup`);
    console.log(`[Cleanup] 7 days cutoff: ${cutoff7DaysISO}`);
    console.log(`[Cleanup] 30 days cutoff: ${cutoff30DaysISO}`);
    console.log(`[Cleanup] 90 days cutoff: ${cutoff90DaysISO}`);
    
    const results = {
      whatsapp_messages: 0,
      conversation_notes: 0,
      conversation_assignments: 0,
      campaign_recipients: 0,
      campaigns: 0,
      conversation_memory: 0,
      flow_sessions: 0,
      lead_activity_log: 0,
      balance_transactions: 0,
    };

    // 1. Get archived conversations older than 7 days
    console.log(`[Cleanup] Fetching archived conversations...`);
    const { data: archivedConversations, error: archiveError } = await supabase
      .from("conversation_assignments")
      .select("id, channel_id, conversation_phone")
      .eq("status", "archived")
      .lt("updated_at", cutoff7DaysISO);

    if (archiveError) {
      console.error("[Cleanup] Error fetching archived conversations:", archiveError);
    } else {
      console.log(`[Cleanup] Found ${archivedConversations?.length || 0} archived conversations to clean`);

      // 2. Delete messages ONLY from archived conversations
      if (archivedConversations && archivedConversations.length > 0) {
        for (const conv of archivedConversations) {
          const phoneSuffix = conv.conversation_phone?.slice(-8);
          
          if (!phoneSuffix || !conv.channel_id) continue;

          // Delete inbound messages (sender_phone matches)
          const { error: inboundError, count: inboundCount } = await supabase
            .from("whatsapp_messages")
            .delete({ count: "exact" })
            .eq("channel_id", conv.channel_id)
            .like("sender_phone", `%${phoneSuffix}`)
            .lt("created_at", cutoff7DaysISO);

          if (!inboundError && inboundCount) {
            results.whatsapp_messages += inboundCount;
          }

          // Delete outbound messages (metadata->destination matches)
          const { error: outboundError, count: outboundCount } = await supabase
            .from("whatsapp_messages")
            .delete({ count: "exact" })
            .eq("channel_id", conv.channel_id)
            .eq("direction", "outbound")
            .like("metadata->>destination", `%${phoneSuffix}`)
            .lt("created_at", cutoff7DaysISO);

          if (!outboundError && outboundCount) {
            results.whatsapp_messages += outboundCount;
          }

          // Delete conversation notes for this archived conversation
          const { error: notesError, count: notesCount } = await supabase
            .from("conversation_notes")
            .delete({ count: "exact" })
            .eq("channel_id", conv.channel_id)
            .like("contact_phone", `%${phoneSuffix}`)
            .lt("created_at", cutoff7DaysISO);

          if (!notesError && notesCount) {
            results.conversation_notes += notesCount;
          }
        }

        console.log(`[Cleanup] Deleted ${results.whatsapp_messages} whatsapp_messages from archived conversations`);
        console.log(`[Cleanup] Deleted ${results.conversation_notes} conversation_notes from archived conversations`);

        // 3. Delete the archived conversation_assignments themselves
        const archivedIds = archivedConversations.map(c => c.id);
        const { error: assignError, count: assignCount } = await supabase
          .from("conversation_assignments")
          .delete({ count: "exact" })
          .in("id", archivedIds);

        if (assignError) {
          console.error("[Cleanup] Error deleting conversation_assignments:", assignError);
        } else {
          results.conversation_assignments = assignCount || 0;
          console.log(`[Cleanup] Deleted ${assignCount} archived conversation_assignments`);
        }
      }
    }

    // 4. Delete old campaign recipients (> 7 days)
    const { error: recipError, count: recipCount } = await supabase
      .from("campaign_recipients")
      .delete({ count: "exact" })
      .lt("created_at", cutoff7DaysISO);
    
    if (recipError) {
      console.error("[Cleanup] Error deleting campaign_recipients:", recipError);
    } else {
      results.campaign_recipients = recipCount || 0;
      console.log(`[Cleanup] Deleted ${recipCount} campaign_recipients`);
    }

    // 5. Delete old completed campaigns (> 7 days)
    const { error: campError, count: campCount } = await supabase
      .from("campaigns")
      .delete({ count: "exact" })
      .eq("status", "completed")
      .lt("completed_at", cutoff7DaysISO);
    
    if (campError) {
      console.error("[Cleanup] Error deleting campaigns:", campError);
    } else {
      results.campaigns = campCount || 0;
      console.log(`[Cleanup] Deleted ${campCount} campaigns`);
    }

    // 6. Delete expired conversation memory
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

    // 7. Delete old flow sessions (> 7 days)
    const { error: flowError, count: flowCount } = await supabase
      .from("flow_sessions")
      .delete({ count: "exact" })
      .lt("updated_at", cutoff7DaysISO);
    
    if (flowError) {
      console.error("[Cleanup] Error deleting flow_sessions:", flowError);
    } else {
      results.flow_sessions = flowCount || 0;
      console.log(`[Cleanup] Deleted ${flowCount} flow_sessions`);
    }

    // 8. Delete old lead activity logs (> 30 days)
    const { error: logError, count: logCount } = await supabase
      .from("lead_activity_log")
      .delete({ count: "exact" })
      .lt("created_at", cutoff30DaysISO);
    
    if (logError) {
      console.error("[Cleanup] Error deleting lead_activity_log:", logError);
    } else {
      results.lead_activity_log = logCount || 0;
      console.log(`[Cleanup] Deleted ${logCount} lead_activity_log entries`);
    }

    // 9. Delete old balance transactions (> 90 days)
    const { error: txError, count: txCount } = await supabase
      .from("balance_transactions")
      .delete({ count: "exact" })
      .lt("created_at", cutoff90DaysISO);
    
    if (txError) {
      console.error("[Cleanup] Error deleting balance_transactions:", txError);
    } else {
      results.balance_transactions = txCount || 0;
      console.log(`[Cleanup] Deleted ${txCount} balance_transactions`);
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[Cleanup] Total records deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup completed. Deleted ${totalDeleted} records.`,
        details: results,
        cutoffs: {
          "7_days": cutoff7DaysISO,
          "30_days": cutoff30DaysISO,
          "90_days": cutoff90DaysISO,
        },
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
