import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * cleanup-old-data (v3 — otimizado + limpeza de arquivados e mensagens locais)
 *
 * POLÍTICA DE RETENÇÃO:
 * ✅ NUNCA apaga: leads manuais, mensagens WhatsApp do banco externo, notas, campanhas.
 * ✅ Limpa dados transitórios/operacionais:
 *    - conversation_memory expirada + sem interação >7 dias
 *    - flow_sessions inativas >7 dias
 *    - lead_activity_log >30 dias
 *    - balance_transactions >180 dias
 *    - conversation_assignments resolvidas/fechadas >15 dias
 *    - campaign_recipients de campanhas concluídas >15 dias
 *    - conversation_metrics de conversas arquivadas >15 dias
 *    - follow_up_logs de sequências concluídas >30 dias
 *    - chat_messages (IA interna) >30 dias
 *    - leads de campanha sem resposta >10 dias
 *    - conversation_assignments arquivadas >30 dias (NOVO)
 *    - whatsapp_messages locais >7 dias — SSoT é banco externo (NOVO)
 */

interface CleanupResults {
  conversation_memory_expired: number;
  conversation_memory_stale: number;
  flow_sessions_inactive: number;
  lead_activity_log_old: number;
  balance_transactions_old: number;
  conversation_assignments_resolved: number;
  campaign_recipients_completed: number;
  conversation_metrics_orphaned: number;
  follow_up_logs_old: number;
  chat_messages_old: number;
  unresponsive_leads_deleted: number;
  archived_assignments_deleted: number;
  local_messages_deleted: number;
}

async function runBatchRpc(
  supabase: ReturnType<typeof createClient>,
  rpcName: string,
  params: Record<string, unknown>,
  batchSize: number,
  label: string,
): Promise<number> {
  let totalDel = 0;
  let keepGoing = true;
  while (keepGoing) {
    const { data, error } = await supabase.rpc(rpcName, {
      ...params,
      batch_size: batchSize,
    });
    if (error) {
      console.error(`[Cleanup] Erro ${label} RPC:`, error);
      keepGoing = false;
    } else {
      const deleted = typeof data === "number" ? data : (data?.deleted_leads ?? 0);
      totalDel += deleted;
      console.log(`[Cleanup] Lote ${label}: ${deleted} (total: ${totalDel})`);
      if (deleted < batchSize) keepGoing = false;
    }
  }
  console.log(`[Cleanup] ${label} removidos: ${totalDel}`);
  return totalDel;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();

    const cutoff = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString();
    };

    console.log(`[Cleanup] Iniciando limpeza otimizada de dados transitórios.`);

    const results: CleanupResults = {
      conversation_memory_expired: 0,
      conversation_memory_stale: 0,
      flow_sessions_inactive: 0,
      lead_activity_log_old: 0,
      balance_transactions_old: 0,
      conversation_assignments_resolved: 0,
      campaign_recipients_completed: 0,
      conversation_metrics_orphaned: 0,
      follow_up_logs_old: 0,
      chat_messages_old: 0,
      unresponsive_leads_deleted: 0,
      archived_assignments_deleted: 0,
      local_messages_deleted: 0,
    };

    // ─── 1. conversation_memory expirada ───
    {
      const { count, error } = await supabase
        .from("conversation_memory")
        .delete({ count: "exact" })
        .lt("expires_at", now.toISOString());
      if (error) console.error("[Cleanup] Erro conversation_memory expirada:", error);
      else results.conversation_memory_expired = count || 0;
    }

    // ─── 2. conversation_memory sem interação >7 dias ───
    results.conversation_memory_stale = await runBatchRpc(
      supabase, "cleanup_stale_conversation_memory",
      { cutoff_date: cutoff(7) }, 2000, "conversation_memory_stale",
    );

    // ─── 3. flow_sessions inativas >7 dias ───
    {
      const { count, error } = await supabase
        .from("flow_sessions")
        .delete({ count: "exact" })
        .lt("updated_at", cutoff(7));
      if (error) console.error("[Cleanup] Erro flow_sessions:", error);
      else results.flow_sessions_inactive = count || 0;
    }

    // ─── 4. lead_activity_log >30 dias ───
    {
      const { count, error } = await supabase
        .from("lead_activity_log")
        .delete({ count: "exact" })
        .lt("created_at", cutoff(30));
      if (error) console.error("[Cleanup] Erro lead_activity_log:", error);
      else results.lead_activity_log_old = count || 0;
    }

    // ─── 5. balance_transactions >180 dias ───
    {
      const { count, error } = await supabase
        .from("balance_transactions")
        .delete({ count: "exact" })
        .lt("created_at", cutoff(180));
      if (error) console.error("[Cleanup] Erro balance_transactions:", error);
      else results.balance_transactions_old = count || 0;
    }

    // ─── 6. conversation_assignments resolvidas >15 dias ───
    results.conversation_assignments_resolved = await runBatchRpc(
      supabase, "cleanup_old_assignments",
      { cutoff_date: cutoff(15) }, 2000, "assignments",
    );

    // ─── 7. campaign_recipients concluídos >15 dias ───
    results.campaign_recipients_completed = await runBatchRpc(
      supabase, "cleanup_old_campaign_recipients",
      { cutoff_date: cutoff(15) }, 2000, "campaign_recipients",
    );

    // ─── 8. conversation_metrics de conversas arquivadas >15 dias ───
    results.conversation_metrics_orphaned = await runBatchRpc(
      supabase, "cleanup_old_conversation_metrics",
      { cutoff_date: cutoff(15) }, 2000, "conversation_metrics",
    );

    // ─── 9. follow_up_logs de sequências concluídas >30 dias ───
    results.follow_up_logs_old = await runBatchRpc(
      supabase, "cleanup_old_follow_up_logs",
      { cutoff_date: cutoff(30) }, 2000, "follow_up_logs",
    );

    // ─── 10. chat_messages (IA interna) >30 dias ───
    results.chat_messages_old = await runBatchRpc(
      supabase, "cleanup_old_chat_messages",
      { cutoff_date: cutoff(30) }, 2000, "chat_messages",
    );

    // ─── 11. leads de campanha sem resposta >10 dias ───
    results.unresponsive_leads_deleted = await runBatchRpc(
      supabase, "cleanup_unresponsive_campaign_leads",
      { days_threshold: 10 }, 500, "leads_sem_resposta",
    );

    // ─── 12. conversation_assignments arquivadas >30 dias (NOVO) ───
    results.archived_assignments_deleted = await runBatchRpc(
      supabase, "cleanup_archived_assignments_batch",
      { cutoff_date: cutoff(30) }, 2000, "archived_assignments",
    );

    // ─── 13. whatsapp_messages locais >7 dias — SSoT é banco externo (NOVO) ───
    results.local_messages_deleted = await runBatchRpc(
      supabase, "cleanup_local_messages_batch",
      { cutoff_date: cutoff(7) }, 5000, "local_messages",
    );

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[Cleanup] Concluído. Total removidos: ${totalDeleted}`, results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Limpeza otimizada concluída. ${totalDeleted} registros removidos.`,
        details: results,
        retention_policy: {
          conversation_memory: "Expirada + sem interação >7 dias",
          flow_sessions: "Inativas >7 dias",
          lead_activity_log: "Mais de 30 dias",
          balance_transactions: "Mais de 180 dias",
          conversation_assignments: "Resolvidas/fechadas >15 dias",
          campaign_recipients: "Campanhas concluídas >15 dias",
          conversation_metrics: "Conversas arquivadas >15 dias",
          follow_up_logs: "Sequências concluídas >30 dias",
          chat_messages: "Conversas IA >30 dias",
          unresponsive_leads: "Sem resposta >10 dias",
          archived_assignments: "Arquivadas >30 dias (com stats órfãs)",
          local_messages: "Mensagens locais >7 dias (SSoT é banco externo)",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cleanup] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
