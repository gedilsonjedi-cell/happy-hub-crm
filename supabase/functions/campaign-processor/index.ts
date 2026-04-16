import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function runs as a cron job every minute.
// It loops internally for up to ~50 seconds, processing ALL running campaigns
// with their configured intervals — so campaigns don't depend on the frontend.

const MAX_EXECUTION_MS = 50_000; // 50 seconds max per invocation

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

    // First, check for scheduled campaigns that should start
    const now = new Date().toISOString()
    const { data: scheduledCampaigns, error: schedError } = await supabase
      .from('campaigns')
      .select('id, name, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
    
    if (!schedError && scheduledCampaigns && scheduledCampaigns.length > 0) {
      console.log(`[Processor] Found ${scheduledCampaigns.length} scheduled campaign(s) ready to start`)
      
      for (const scheduled of scheduledCampaigns) {
        console.log(`[Processor] Starting scheduled campaign: ${scheduled.name}`)
        await supabase
          .from('campaigns')
          .update({ status: 'running', started_at: now, updated_at: now })
          .eq('id', scheduled.id)
      }
    }

    // Track per-campaign state across iterations
    const campaignLastSentAt = new Map<string, number>()
    let totalBatchesSent = 0
    let iteration = 0

    // Main processing loop — runs until time budget is exhausted
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      iteration++

      // Refresh running campaigns list each iteration (status may change)
      const { data: runningCampaigns, error: campError } = await supabase
        .from('campaigns')
        .select('id, name, min_interval, max_interval, sent_count, total_recipients, status')
        .eq('status', 'running')

      if (campError) {
        console.error('[Processor] Error fetching campaigns:', campError)
        break
      }

      // Also check for campaigns with pending retries
      const nowIso = new Date().toISOString()
      const { data: retryRecipients } = await supabase
        .from('campaign_recipients')
        .select('campaign_id')
        .eq('status', 'waiting_retry')
        .lte('next_retry_at', nowIso)
        .limit(50)

      const retryIds = [...new Set((retryRecipients || []).map(r => r.campaign_id))]
      const runningIds = (runningCampaigns || []).map(c => c.id)
      const onlyRetryIds = retryIds.filter(id => !runningIds.includes(id))

      let retriableCampaigns: any[] = []
      if (onlyRetryIds.length > 0) {
        const { data: retryCamps } = await supabase
          .from('campaigns')
          .select('id, name, min_interval, max_interval, sent_count, total_recipients, status')
          .in('id', onlyRetryIds)
          .in('status', ['completed', 'paused'])
        retriableCampaigns = retryCamps || []
      }

      const allCampaigns = [...(runningCampaigns || []), ...retriableCampaigns]

      if (allCampaigns.length === 0) {
        console.log(`[Processor] No campaigns to process, exiting loop after ${iteration} iterations`)
        break
      }

      let anyProcessed = false

      for (const campaign of allCampaigns) {
        // Check time budget
        if (Date.now() - startTime >= MAX_EXECUTION_MS) break

        const isFullMode = campaign.min_interval === 0 && campaign.max_interval === 0
        const isRetryOnly = retriableCampaigns.some((c: any) => c.id === campaign.id)

        // Calculate wait time for this campaign
        const lastSent = campaignLastSentAt.get(campaign.id) || 0
        const elapsed = Date.now() - lastSent

        let requiredWait: number
        if (isRetryOnly || isFullMode) {
          requiredWait = isFullMode ? 500 : 0
        } else {
          const minInterval = campaign.min_interval || 5
          const maxInterval = campaign.max_interval || 120
          // Use random interval within the configured range
          requiredWait = (Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval) * 1000
        }

        // Skip if not enough time has passed
        if (lastSent > 0 && elapsed < requiredWait) {
          continue
        }

        // Send a batch
        try {
          const requestBody = isFullMode
            ? { campaignId: campaign.id, batchSize: 99, processRetries: isRetryOnly }
            : { campaignId: campaign.id, processRetries: isRetryOnly }

          const { data: result, error: invokeError } = await supabase.functions.invoke('send-campaign-batch', {
            body: requestBody
          })

          campaignLastSentAt.set(campaign.id, Date.now())

          if (invokeError) {
            console.error(`[Processor] Error for ${campaign.name}:`, invokeError.message)
            continue
          }

          totalBatchesSent++
          anyProcessed = true

          if (result?.done) {
            console.log(`[Processor] ${campaign.name}: COMPLETED`)
            campaignLastSentAt.delete(campaign.id)
          } else {
            const sentInfo = `sent=${result?.sent || 0}, failed=${result?.failed || 0}`
            if (iteration <= 3 || totalBatchesSent % 10 === 0) {
              console.log(`[Processor] ${campaign.name}: ${sentInfo} (iter ${iteration})`)
            }
          }

          // If waiting_retry status, add extra delay
          if (result?.status === 'waiting_retry') {
            campaignLastSentAt.set(campaign.id, Date.now() + 55_000) // wait ~60s
          }
        } catch (err) {
          console.error(`[Processor] Error processing ${campaign.name}:`, err)
        }
      }

      // If nothing was ready to process, sleep briefly to avoid tight loop
      if (!anyProcessed) {
        // Find minimum time until next campaign is ready
        let minWait = 5000
        for (const campaign of allCampaigns) {
          const lastSent = campaignLastSentAt.get(campaign.id) || 0
          if (lastSent > 0) {
            const minInterval = campaign.min_interval || 5
            const remaining = (minInterval * 1000) - (Date.now() - lastSent)
            if (remaining > 0 && remaining < minWait) {
              minWait = remaining
            }
          }
        }
        // Cap sleep to avoid wasting too much time
        const sleepTime = Math.min(minWait, 5000)
        await new Promise(resolve => setTimeout(resolve, sleepTime))
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[Processor] Cycle complete: ${totalBatchesSent} batches in ${elapsed}ms (${iteration} iterations)`)

    return new Response(JSON.stringify({
      success: true,
      totalBatchesSent,
      iterations: iteration,
      elapsedMs: elapsed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[Processor] Fatal error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
