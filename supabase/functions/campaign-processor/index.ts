import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function runs continuously as a cron job (every 30 seconds)
// It processes ALL running campaigns independently
// NEW: Also processes scheduled retries for completed campaigns

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
        
        // Update status to running
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({ 
            status: 'running', 
            started_at: now,
            updated_at: now 
          })
          .eq('id', scheduled.id)
        
        if (updateError) {
          console.error(`[Processor] Error starting scheduled campaign ${scheduled.name}:`, updateError)
        } else {
          console.log(`[Processor] Successfully started scheduled campaign: ${scheduled.name}`)
        }
      }
    }

    // Get all running campaigns
    const { data: runningCampaigns, error: campError } = await supabase
      .from('campaigns')
      .select('id, name, min_interval, max_interval, sent_count, total_recipients, updated_at')
      .eq('status', 'running')

    if (campError) {
      console.error('[Processor] Error fetching running campaigns:', campError)
    }

    // NEW: Check for campaigns with pending retries (even if "completed")
    // This allows us to continue processing retries after initial send is done
    const { data: campaignsWithRetries, error: retryError } = await supabase
      .from('campaign_recipients')
      .select('campaign_id')
      .eq('status', 'waiting_retry')
      .lte('next_retry_at', now)
      .limit(100)

    // Get unique campaign IDs with ready retries
    const retryCAmpignIds = [...new Set((campaignsWithRetries || []).map(r => r.campaign_id))];
    
    // Fetch details for campaigns with retries that aren't already running
    let retriableCampaigns: any[] = [];
    if (retryCAmpignIds.length > 0) {
      const runningIds = (runningCampaigns || []).map(c => c.id);
      const onlyRetryIds = retryCAmpignIds.filter(id => !runningIds.includes(id));
      
      if (onlyRetryIds.length > 0) {
        const { data: retryCamps } = await supabase
          .from('campaigns')
          .select('id, name, min_interval, max_interval, sent_count, total_recipients, updated_at')
          .in('id', onlyRetryIds)
          .in('status', ['completed', 'paused']) // Process retries for completed/paused campaigns too
        
        retriableCampaigns = retryCamps || [];
        console.log(`[Processor] Found ${retriableCampaigns.length} campaign(s) with ready retries`)
      }
    }

    // Combine all campaigns to process
    const allCampaigns = [...(runningCampaigns || []), ...retriableCampaigns];

    if (allCampaigns.length === 0) {
      console.log('[Processor] No campaigns to process')
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No campaigns to process',
        processed: 0,
        scheduledStarted: scheduledCampaigns?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Processor] Processing ${allCampaigns.length} campaign(s) (${runningCampaigns?.length || 0} running, ${retriableCampaigns.length} with retries)`)

    const results: any[] = []

    // Process each campaign
    for (const campaign of allCampaigns) {
      const lastUpdate = new Date(campaign.updated_at).getTime()
      const nowMs = Date.now()
      const minWait = (campaign.min_interval || 5) * 1000
      const isFullMode = campaign.min_interval === 0 && campaign.max_interval === 0;
      
      // For retry campaigns, process immediately
      const isRetryOnly = retriableCampaigns.some(c => c.id === campaign.id);
      
      // Check if enough time has passed since last update (skip for retry-only and full mode)
      if (!isRetryOnly && !isFullMode && nowMs - lastUpdate < minWait) {
        console.log(`[Processor] ${campaign.name}: waiting (${Math.round((nowMs - lastUpdate) / 1000)}s < ${campaign.min_interval}s)`)
        results.push({ 
          campaign: campaign.name, 
          status: 'waiting',
          waitedSeconds: Math.round((nowMs - lastUpdate) / 1000)
        })
        continue
      }

      console.log(`[Processor] Processing ${campaign.name}${isRetryOnly ? ' (retries only)' : ''}${isFullMode ? ' (FULL MODE)' : ''}...`)

      try {
        const requestBody = isFullMode
          ? { campaignId: campaign.id, batchSize: 99, processRetries: isRetryOnly }
          : { campaignId: campaign.id, processRetries: isRetryOnly }

        const { data: result, error: invokeError } = await supabase.functions.invoke('send-campaign-batch', {
          body: requestBody
        })

        if (invokeError) {
          console.error(`[Processor] Error invoking for ${campaign.name}:`, invokeError)
          results.push({
            campaign: campaign.name,
            status: 'error',
            error: invokeError.message
          })
          continue
        }

        console.log(`[Processor] ${campaign.name}: ${JSON.stringify(result)}`)

        results.push({
          campaign: campaign.name,
          status: result?.done ? 'completed' : (result?.status || 'sent'),
          pendingRetries: result?.pendingRetries || 0,
          ...result
        })
      } catch (err) {
        console.error(`[Processor] Error processing ${campaign.name}:`, err)
        results.push({
          campaign: campaign.name,
          status: 'error',
          error: String(err)
        })
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[Processor] Cycle complete in ${elapsed}ms`)

    return new Response(JSON.stringify({
      success: true,
      processed: allCampaigns.length,
      results,
      elapsedMs: elapsed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[Processor] Error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
