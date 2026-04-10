import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * cleanup-old-data
 *
 * POLÍTICA:
 * ✅ NUNCA apaga: leads, mensagens (whatsapp_messages), notas, campanhas.
 * ✅ Limpa dados transitórios/operacionais:
 *    - conversation_memory (expirada)
 *    - flow_sessions (inativas >7 dias)
 *    - lead_activity_log (>90 dias)
 *    - balance_transactions (>180 dias)
 *    - conversation_assignments resolvidas/fechadas (>15 dias)
 *    - campaign_recipients de campanhas concluídas (>15 dias)
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

    const cutoff7Days = new Date(now);
    cutoff7Days.setDate(cutoff7Days.getDate() - 7);

    const cutoff15Days = new Date(now);
    cutoff15Days.setDate(cutoff15Days.getDate() - 15);

    const cutoff90Days = new Date(now);
    cutoff90Days.setDate(cutoff90Days.getDate() - 90);

    const cutoff180Days = new Date(now);
    cutoff180Days.setDate(cutoff180Days.getDate() - 180);

    console.log(`[Cleanup] Iniciando limpeza de logs técnicos.`);
    console.log(`[Cleanup] Cutoffs: 7d=${cutoff7Days.toISOString()}, 15d=${cutoff15Days.toISOString()}, 90d=${cutoff90Days.toISOString()}, 180d=${cutoff180Days.toISOString()}`);

    const results = {
      conversation_memory_expired: 0,
      flow_sessions_inactive: 0,
      lead_activity_log_old: 0,
      balance_transactions_old: 0,
      conversation_assignments_resolved: 0,
      campaign_recipients_completed: 0,
    };

    // ─── 1. Limpar conversation_memory expirada (expiração definida pelo próprio sistema) ──
    // Esses registros têm um campo expires_at que o bot define. Quando expiram, são inúteis.
    const { count: memCount, error: memError } = await supabase
      .from("conversation_memory")
      .delete({ count: "exact" })
      .lt("expires_at", now.toISOString());

    if (memError) {
      console.error("[Cleanup] Erro ao limpar conversation_memory:", memError);
    } else {
      results.conversation_memory_expired = memCount || 0;
      console.log(`[Cleanup] conversation_memory expirada removida: ${memCount}`);
    }

    // ─── 2. Limpar flow_sessions de bots inativas há >7 dias ─────────────────────────────
    // Sessões de flow bot que não têm atividade há 7+ dias são consideradas abandonadas.
    const { count: flowCount, error: flowError } = await supabase
      .from("flow_sessions")
      .delete({ count: "exact" })
      .lt("updated_at", cutoff7Days.toISOString());

    if (flowError) {
      console.error("[Cleanup] Erro ao limpar flow_sessions:", flowError);
    } else {
      results.flow_sessions_inactive = flowCount || 0;
      console.log(`[Cleanup] flow_sessions inativas removidas: ${flowCount}`);
    }

    // ─── 3. Limpar lead_activity_log há >90 dias ─────────────────────────────────────────
    // Log técnico de atividades. Após 90 dias, não tem valor operacional.
    const { count: logCount, error: logError } = await supabase
      .from("lead_activity_log")
      .delete({ count: "exact" })
      .lt("created_at", cutoff90Days.toISOString());

    if (logError) {
      console.error("[Cleanup] Erro ao limpar lead_activity_log:", logError);
    } else {
      results.lead_activity_log_old = logCount || 0;
      console.log(`[Cleanup] lead_activity_log antigo removido: ${logCount}`);
    }

    // ─── 4. Limpar balance_transactions há >180 dias ──────────────────────────────────────
    // Histórico financeiro operacional. Mantemos 180 dias (6 meses) para auditoria.
    const { count: txCount, error: txError } = await supabase
      .from("balance_transactions")
      .delete({ count: "exact" })
      .lt("created_at", cutoff180Days.toISOString());

    if (txError) {
      console.error("[Cleanup] Erro ao limpar balance_transactions:", txError);
    } else {
      results.balance_transactions_old = txCount || 0;
      console.log(`[Cleanup] balance_transactions antigas removidas: ${txCount}`);
    }

    // ─── 5. Limpar conversation_assignments resolvidas/fechadas/arquivadas há >15 dias ───
    // Usa RPC para deletar em lotes via SQL direto (evita limite de URL do PostgREST)
    {
      let totalDel = 0;
      let keepGoing = true;
      while (keepGoing) {
        const { data, error } = await supabase.rpc("cleanup_old_assignments", {
          cutoff_date: cutoff15Days.toISOString(),
          batch_size: 2000,
        });
        if (error) {
          console.error("[Cleanup] Erro assignments RPC:", error);
          keepGoing = false;
        } else {
          const deleted = data || 0;
          totalDel += deleted;
          console.log(`[Cleanup] Lote assignments: ${deleted} (total: ${totalDel})`);
          if (deleted < 2000) keepGoing = false;
        }
      }
      results.conversation_assignments_resolved = totalDel;
      console.log(`[Cleanup] Assignments removidas: ${totalDel}`);
    }

    // ─── 6. Limpar campaign_recipients de campanhas concluídas há >15 dias ────
    {
      let totalDel = 0;
      let keepGoing = true;
      while (keepGoing) {
        const { data, error } = await supabase.rpc("cleanup_old_campaign_recipients", {
          cutoff_date: cutoff15Days.toISOString(),
          batch_size: 2000,
        });
        if (error) {
          console.error("[Cleanup] Erro recipients RPC:", error);
          keepGoing = false;
        } else {
          const deleted = data || 0;
          totalDel += deleted;
          console.log(`[Cleanup] Lote recipients: ${deleted} (total: ${totalDel})`);
          if (deleted < 2000) keepGoing = false;
        }
      }
      results.campaign_recipients_completed = totalDel;
      console.log(`[Cleanup] Recipients removidos: ${totalDel}`);
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[Cleanup] Concluído. Total de registros técnicos removidos: ${totalDeleted}`, results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Limpeza de logs técnicos concluída. ${totalDeleted} registros removidos.`,
        details: results,
        policy: {
          never_deleted: [
            "leads / contatos",
            "whatsapp_messages (mensagens)",
            "conversation_notes (notas)",
            "campaigns (campanhas)",
          ],
          cleaned_technical_logs: {
            conversation_memory: "Memória de bot expirada (campo expires_at)",
            flow_sessions: "Sessões de flow bot inativas há >7 dias",
            lead_activity_log: "Log de atividades de leads há >90 dias",
            balance_transactions: "Transações financeiras há >180 dias",
            conversation_assignments: "Resolvidas/fechadas há >15 dias",
            campaign_recipients: "De campanhas concluídas há >15 dias",
          },
        },
        cutoffs: {
          "7_days_flow_sessions": cutoff7Days.toISOString(),
          "15_days_assignments_recipients": cutoff15Days.toISOString(),
          "90_days_activity_log": cutoff90Days.toISOString(),
          "180_days_transactions": cutoff180Days.toISOString(),
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
