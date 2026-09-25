import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function runs as a cron job every minute.
// It loops internally for up to ~50 seconds, processing ALL running campaigns
// CONCURRENTLY with their configured intervals — designed for multi-tenant scale.

const MAX_EXECUTION_MS = 50_000; // 50 seconds max per invocation
const MAX_CONCURRENT_CAMPAIGNS = 10; // Process up to 10 campaigns in parallel

interface CampaignState {
  id: string;
  name: string;
  min_interval: number;
  max_interval: number;
  sent_count: number;
  total_recipients: number;
  status: string;
  lastSentAt: number;
  isRetryOnly: boolean;
  batchesSent: number;
  done: boolean;
}

function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function processCampaignBatch(
  supabase: any,
  state: CampaignState,
  startTime: number
): Promise<void> {
  if (state.done || Date.now() - startTime >= MAX_EXECUTION_MS) return;

  const isFullMode = state.min_interval === 0 && state.max_interval === 0;
  // Sem espera por intervalo aqui: o banco (scheduled_at) decide quem sai.
  if (state.lastSentAt > Date.now()) return; // pausa de retry

  try {
    const requestBody = isFullMode
      ? { campaignId: state.id, batchSize: 99, processRetries: state.isRetryOnly }
      : { campaignId: state.id, processRetries: state.isRetryOnly };

    const { data: result, error: invokeError } = await supabase.functions.invoke('send-campaign-batch', {
      body: requestBody
    });

    state.lastSentAt = Date.now();

    if (invokeError) {
      console.error(`[Processor] Error for ${state.name}:`, invokeError.message);
      return;
    }

    state.batchesSent++;

    if (result?.done) {
      console.log(`[Processor] ${state.name}: COMPLETED after ${state.batchesSent} batches`);
      state.done = true;
    } else if (result?.status === 'waiting_retry') {
      // Pause this campaign for ~60s
      state.lastSentAt = Date.now() + 55_000;
    }
  } catch (err) {
    console.error(`[Processor] Error processing ${state.name}:`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('[Processor] Starting campaign processing cycle...')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Start scheduled campaigns
    const now = new Date().toISOString()
    const { data: scheduledCampaigns } = await supabase
      .from('campaigns')
      .select('id, name, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
    
    if (scheduledCampaigns && scheduledCampaigns.length > 0) {
      console.log(`[Processor] Starting ${scheduledCampaigns.length} scheduled campaign(s)`)
      for (const scheduled of scheduledCampaigns) {
        await supabase
          .from('campaigns')
          .update({ status: 'running', started_at: now, updated_at: now })
          .eq('id', scheduled.id)
      }
    }

    // Build campaign state map
    const campaignStates = new Map<string, CampaignState>();
    let totalBatchesSent = 0;
    let iteration = 0;

    // Cache de retries — re-consulta a cada RETRY_REFRESH_ITERATIONS ou quando uma campanha termina
    const RETRY_REFRESH_ITERATIONS = 5;
    let lastRetryRefreshIter = -RETRY_REFRESH_ITERATIONS;
    let cachedRetryIds: string[] = [];
    let doneSinceLastRefresh = false;

    // Main processing loop
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      iteration++;

      // Refresh campaign list (running) toda iteração — é a fonte de verdade de status
      const { data: runningCampaigns, error: campError } = await supabase
        .from('campaigns')
        .select('id, name, min_interval, max_interval, sent_count, total_recipients, status')
        .eq('status', 'running')

      if (campError) {
        console.error('[Processor] Error fetching campaigns:', campError);
        break;
      }

      // Retry-only: re-consulta apenas periodicamente ou quando algo terminou
      const shouldRefreshRetries =
        iteration - lastRetryRefreshIter >= RETRY_REFRESH_ITERATIONS || doneSinceLastRefresh;

      if (shouldRefreshRetries) {
        const nowIso = new Date().toISOString();
        const { data: retryRecipients } = await supabase
          .from('campaign_recipients')
          .select('campaign_id')
          .eq('status', 'waiting_retry')
          .lte('next_retry_at', nowIso)
          .limit(50);

        cachedRetryIds = [...new Set((retryRecipients || []).map((r: any) => r.campaign_id))];
        lastRetryRefreshIter = iteration;
        doneSinceLastRefresh = false;
      }

      const runningIds = (runningCampaigns || []).map((c: any) => c.id);
      const onlyRetryIds = cachedRetryIds.filter(id => !runningIds.includes(id));

      let retriableCampaigns: any[] = [];
      if (onlyRetryIds.length > 0) {
        const { data: retryCamps } = await supabase
          .from('campaigns')
          .select('id, name, min_interval, max_interval, sent_count, total_recipients, status')
          .in('id', onlyRetryIds)
          .in('status', ['completed', 'paused']);
        retriableCampaigns = retryCamps || [];
      }

      const allCampaigns = [...(runningCampaigns || []), ...retriableCampaigns];

      if (allCampaigns.length === 0) {
        console.log(`[Processor] No campaigns to process, exiting after ${iteration} iterations`);
        break;
      }

      // Update/create states for active campaigns
      const activeCampaignIds = new Set<string>();
      for (const campaign of allCampaigns) {
        activeCampaignIds.add(campaign.id);
        if (!campaignStates.has(campaign.id)) {
          campaignStates.set(campaign.id, {
            id: campaign.id,
            name: campaign.name,
            min_interval: campaign.min_interval,
            max_interval: campaign.max_interval,
            sent_count: campaign.sent_count,
            total_recipients: campaign.total_recipients,
            status: campaign.status,
            lastSentAt: 0,
            isRetryOnly: retriableCampaigns.some((c: any) => c.id === campaign.id),
            batchesSent: 0,
            done: false,
          });
        }
      }

      // Remove campaigns no longer active
      for (const [id] of campaignStates) {
        if (!activeCampaignIds.has(id)) {
          campaignStates.delete(id);
        }
      }

      // Get campaigns ready to process (not done, interval elapsed)
      const readyCampaigns: CampaignState[] = [];
      for (const state of campaignStates.values()) {
        if (state.done) continue;
        const isFullMode = state.min_interval === 0 && state.max_interval === 0;
        const elapsed = Date.now() - state.lastSentAt;
        // Apenas frequência de consulta ao banco (não é a cadência do envio).
        const minWait = state.lastSentAt === 0 ? 0 : (isFullMode ? 300 : 5_000);
        
        if (elapsed >= minWait) {
          readyCampaigns.push(state);
        }
      }

      if (readyCampaigns.length === 0) {
        // Dorme até a menor janela real de envio (não fixo em 3s).
        // Teto de 15s para ainda captar status novos vindo do frontend em tempo hábil.
        let minWait = 15_000;
        for (const state of campaignStates.values()) {
          if (state.done) continue;
          const isFullMode = state.min_interval === 0 && state.max_interval === 0;
          const elapsed = Date.now() - state.lastSentAt;
          const minInterval = isFullMode ? 300 : 5_000;
          const remaining = minInterval - elapsed;
          if (remaining > 0 && remaining < minWait) {
            minWait = remaining;
          }
        }
        // Não ultrapassar o tempo restante da invocação
        const budgetLeft = MAX_EXECUTION_MS - (Date.now() - startTime);
        const sleepMs = Math.max(200, Math.min(minWait, budgetLeft - 100));
        if (sleepMs <= 0) break;
        await new Promise(resolve => setTimeout(resolve, sleepMs));
        continue;
      }

      // Process campaigns in PARALLEL batches (up to MAX_CONCURRENT_CAMPAIGNS)
      const batch = readyCampaigns.slice(0, MAX_CONCURRENT_CAMPAIGNS);

      const doneBefore = [...campaignStates.values()].filter(s => s.done).length;
      await Promise.all(
        batch.map(state => processCampaignBatch(supabase, state, startTime))
      );
      const doneAfter = [...campaignStates.values()].filter(s => s.done).length;
      if (doneAfter > doneBefore) doneSinceLastRefresh = true;

      // Count total batches
      totalBatchesSent = 0;
      for (const state of campaignStates.values()) {
        totalBatchesSent += state.batchesSent;
      }

      // Log progress periodically
      if (iteration % 5 === 0 || iteration <= 2) {
        const activeSummary = [...campaignStates.values()]
          .filter(s => !s.done)
          .map(s => `${s.name}(${s.batchesSent})`)
          .join(', ');
        console.log(`[Processor] iter=${iteration} batches=${totalBatchesSent} active=[${activeSummary}]`);
      }
    }

    const elapsed = Date.now() - startTime;
    const summary = [...campaignStates.values()].map(s => 
      `${s.name}: ${s.batchesSent} batches${s.done ? ' (DONE)' : ''}`
    ).join(', ');
    
    console.log(`[Processor] Cycle complete: ${totalBatchesSent} batches in ${elapsed}ms (${iteration} iters) — ${summary}`);

    return new Response(JSON.stringify({
      success: true,
      totalBatchesSent,
      iterations: iteration,
      elapsedMs: elapsed,
      campaigns: [...campaignStates.values()].map(s => ({
        name: s.name,
        batches: s.batchesSent,
        done: s.done
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Processor] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
