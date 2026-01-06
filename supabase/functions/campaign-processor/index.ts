import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// This function runs continuously as a cron job (every 30 seconds)
// It processes ALL running campaigns independently

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

    // Get all running campaigns
    const { data: campaigns, error: campError } = await supabase
      .from('campaigns')
      .select('id, name, min_interval, max_interval, sent_count, total_recipients, updated_at')
      .eq('status', 'running')

    if (campError) {
      console.error('[Processor] Error fetching campaigns:', campError)
      return new Response(JSON.stringify({ error: 'Error fetching campaigns' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[Processor] No running campaigns found')
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No running campaigns',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Processor] Found ${campaigns.length} running campaign(s)`)

    const results: any[] = []

    // Process each campaign
    for (const campaign of campaigns) {
      const lastUpdate = new Date(campaign.updated_at).getTime()
      const now = Date.now()
      const minWait = (campaign.min_interval || 5) * 1000
      
      // Check if enough time has passed since last update
      if (now - lastUpdate < minWait) {
        console.log(`[Processor] ${campaign.name}: waiting (${Math.round((now - lastUpdate) / 1000)}s < ${campaign.min_interval}s)`)
        results.push({ 
          campaign: campaign.name, 
          status: 'waiting',
          waitedSeconds: Math.round((now - lastUpdate) / 1000)
        })
        continue
      }

      console.log(`[Processor] Processing ${campaign.name}...`)

      try {
        // Use supabase.functions.invoke which handles auth properly
        const { data: result, error: invokeError } = await supabase.functions.invoke('send-campaign-batch', {
          body: {
            campaignId: campaign.id,
            batchSize: 1
          }
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
          status: result?.done ? 'completed' : 'sent',
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
      processed: campaigns.length,
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
