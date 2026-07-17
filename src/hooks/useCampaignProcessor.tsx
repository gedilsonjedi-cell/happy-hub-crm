import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Campaign {
  id: string;
  name: string;
  status: string;
  sent_count: number;
  total_recipients: number;
  min_interval?: number;
  max_interval?: number;
}

interface UseCampaignProcessorOptions {
  campaigns: Campaign[];
  onUpdate: () => void;
  enabled?: boolean;
}

/**
 * READ-ONLY hook.
 *
 * O disparo de mensagens é responsabilidade EXCLUSIVA do cron server-side
 * (`campaign-processor` chamado por pg_cron). Este hook não invoca mais
 * `send-campaign-batch` — antes ele duplicava o trabalho do cron a partir
 * do navegador, sobrecarregando o banco com SELECTs concorrentes.
 *
 * A API (`startProcessing` / `stopProcessing`) é preservada para não
 * quebrar chamadores. `startProcessing` faz um "kick" fire-and-forget no
 * `campaign-processor` para reduzir a latência de até ~60s do próximo tick
 * do cron quando o usuário clica em "Iniciar" ou "Retomar". `stopProcessing`
 * vira no-op — pausa/cancelamento já é feito via `UPDATE campaigns.status`
 * pelo caller, e o cron respeita esse status na próxima iteração.
 */
export function useCampaignProcessor(_options: UseCampaignProcessorOptions) {
  const startProcessing = useCallback((_campaignId: string) => {
    // Kick fire-and-forget: dispara uma execução imediata do processor
    // para não esperar até 60s pelo próximo tick do cron.
    supabase.functions
      .invoke("campaign-processor", { body: {} })
      .catch((err) => {
        // Silencioso: se falhar, o cron pega no próximo minuto.
        console.warn("[useCampaignProcessor] kick failed:", err?.message ?? err);
      });
  }, []);

  const stopProcessing = useCallback((_campaignId: string) => {
    // No-op: o cron respeita campaigns.status na próxima iteração.
  }, []);

  return {
    startProcessing,
    stopProcessing,
    isProcessing: (_campaignId: string) => false,
  };
}
