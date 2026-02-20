import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * cleanup-old-data
 *
 * POLICY (strictly enforced):
 * - Mensagens (whatsapp_messages) → NUNCA apagadas diretamente.
 *   Apenas mensagens de conversas arquivadas há >15 dias são removidas.
 * - Leads → NUNCA apagados.
 * - Logs técnicos (flow_sessions, conversation_memory, lead_activity_log) → limpos por prazo.
 * - Campanhas concluídas + recipients → limpos após 30 dias.
 * - Balance transactions → limpos após 90 dias.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();

    const cutoff15Days = new Date(now);
    cutoff15Days.setDate(cutoff15Days.getDate() - 15);

    const cutoff30Days = new Date(now);
    cutoff30Days.setDate(cutoff30Days.getDate() - 30);

    const cutoff90Days = new Date(now);
    cutoff90Days.setDate(cutoff90Days.getDate() - 90);

    const cutoff7Days = new Date(now);
    cutoff7Days.setDate(cutoff7Days.getDate() - 7);

    console.log(`[Cleanup] Starting. Cutoffs: 15d=${cutoff15Days.toISOString()}, 30d=${cutoff30Days.toISOString()}, 90d=${cutoff90Days.toISOString()}`);

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

    // ─── 1. Limpar mensagens SOMENTE de conversas arquivadas há >15 dias ──────
    // Leads e mensagens de conversas ativas NUNCA são tocados.
    console.log(`[Cleanup] Fetching archived conversations older than 15 days...`);
    const { data: archivedConversations, error: archiveError } = await supabase
      .from("conversation_assignments")
      .select("id, channel_id, conversation_phone")
      .eq("status", "archived")
      .lt("updated_at", cutoff15Days.toISOString());

    if (archiveError) {
      console.error("[Cleanup] Error fetching archived conversations:", archiveError);
    } else {
      console.log(`[Cleanup] Found ${archivedConversations?.length || 0} archived conversations`);

      if (archivedConversations && archivedConversations.length > 0) {
        // Process in batches of 20 to avoid overwhelming the DB
        const BATCH_SIZE = 20;
        for (let i = 0; i < archivedConversations.length; i += BATCH_SIZE) {
          const batch = archivedConversations.slice(i, i + BATCH_SIZE);

          await Promise.all(batch.map(async (conv) => {
            const phoneSuffix = conv.conversation_phone?.slice(-8);
            if (!phoneSuffix || !conv.channel_id) return;

            const [inboundDel, outboundDel, notesDel] = await Promise.all([
              // Delete inbound messages
              supabase
                .from("whatsapp_messages")
                .delete({ count: "exact" })
                .eq("channel_id", conv.channel_id)
                .like("sender_phone", `%${phoneSuffix}`)
                .lt("created_at", cutoff15Days.toISOString()),
              // Delete outbound messages
              supabase
                .from("whatsapp_messages")
                .delete({ count: "exact" })
                .eq("channel_id", conv.channel_id)
                .eq("direction", "outbound")
                .like("metadata->>destination", `%${phoneSuffix}`)
                .lt("created_at", cutoff15Days.toISOString()),
              // Delete conversation notes
              supabase
                .from("conversation_notes")
                .delete({ count: "exact" })
                .eq("channel_id", conv.channel_id)
                .like("contact_phone", `%${phoneSuffix}`)
                .lt("created_at", cutoff15Days.toISOString()),
            ]);

            results.whatsapp_messages += (inboundDel.count || 0) + (outboundDel.count || 0);
            results.conversation_notes += notesDel.count || 0;
          }));
        }

        console.log(`[Cleanup] Deleted ${results.whatsapp_messages} messages, ${results.conversation_notes} notes`);

        // Delete the archived assignments themselves
        const archivedIds = archivedConversations.map(c => c.id);
        const { count: assignCount } = await supabase
          .from("conversation_assignments")
          .delete({ count: "exact" })
          .in("id", archivedIds);

        results.conversation_assignments = assignCount || 0;
        console.log(`[Cleanup] Deleted ${assignCount} archived conversation_assignments`);
      }
    }

    // ─── 2. Limpar campaign_recipients de campanhas concluídas há >30 dias ──
    const { count: recipCount } = await supabase
      .from("campaign_recipients")
      .delete({ count: "exact" })
      .lt("created_at", cutoff30Days.toISOString());
    results.campaign_recipients = recipCount || 0;

    // ─── 3. Limpar campanhas concluídas há >30 dias ───────────────────────────
    const { count: campCount } = await supabase
      .from("campaigns")
      .delete({ count: "exact" })
      .eq("status", "completed")
      .lt("completed_at", cutoff30Days.toISOString());
    results.campaigns = campCount || 0;

    // ─── 4. Limpar conversation_memory expirada ───────────────────────────────
    const { count: memCount } = await supabase
      .from("conversation_memory")
      .delete({ count: "exact" })
      .lt("expires_at", now.toISOString());
    results.conversation_memory = memCount || 0;

    // ─── 5. Limpar flow_sessions inativas há >7 dias ─────────────────────────
    const { count: flowCount } = await supabase
      .from("flow_sessions")
      .delete({ count: "exact" })
      .lt("updated_at", cutoff7Days.toISOString());
    results.flow_sessions = flowCount || 0;

    // ─── 6. Limpar lead_activity_log há >30 dias ─────────────────────────────
    const { count: logCount } = await supabase
      .from("lead_activity_log")
      .delete({ count: "exact" })
      .lt("created_at", cutoff30Days.toISOString());
    results.lead_activity_log = logCount || 0;

    // ─── 7. Limpar balance_transactions há >90 dias ───────────────────────────
    const { count: txCount } = await supabase
      .from("balance_transactions")
      .delete({ count: "exact" })
      .lt("created_at", cutoff90Days.toISOString());
    results.balance_transactions = txCount || 0;

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[Cleanup] Done. Total deleted: ${totalDeleted}`, results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup completed. Deleted ${totalDeleted} records.`,
        details: results,
        policy: "Messages/Leads are NEVER deleted. Only archived conversation messages (>15d) are removed.",
        cutoffs: {
          "15_days_archived_messages": cutoff15Days.toISOString(),
          "30_days_campaigns": cutoff30Days.toISOString(),
          "7_days_flow_sessions": cutoff7Days.toISOString(),
          "90_days_transactions": cutoff90Days.toISOString(),
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

