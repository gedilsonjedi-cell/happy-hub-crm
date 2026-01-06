import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Watchdog: verifica campanhas travadas e reinicia automaticamente
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Watchdog] Checking for stalled campaigns...');

    // Busca campanhas com status "running" que não atualizaram nos últimos 60 segundos
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    
    const { data: stalledCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, sent_count, total_recipients, updated_at, organization_id')
      .eq('status', 'running')
      .lt('updated_at', oneMinuteAgo);

    if (error) {
      console.error('[Watchdog] Error fetching campaigns:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stalledCampaigns || stalledCampaigns.length === 0) {
      console.log('[Watchdog] No stalled campaigns found');
      return new Response(
        JSON.stringify({ success: true, message: 'No stalled campaigns', restarted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Watchdog] Found ${stalledCampaigns.length} stalled campaign(s)`);

    const restartedCampaigns: string[] = [];

    for (const campaign of stalledCampaigns) {
      // Verifica se ainda há destinatários pendentes
      if (campaign.sent_count >= campaign.total_recipients) {
        // Campanha já terminou, marca como completed
        console.log(`[Watchdog] Campaign ${campaign.id} is done, marking as completed`);
        await supabase
          .from('campaigns')
          .update({ 
            status: 'completed', 
            completed_at: new Date().toISOString() 
          })
          .eq('id', campaign.id);
        continue;
      }

      console.log(`[Watchdog] Restarting stalled campaign: ${campaign.name} (${campaign.id})`);
      console.log(`[Watchdog] Progress: ${campaign.sent_count}/${campaign.total_recipients}`);

      // Busca os leads da organização para continuar o envio
      const { data: leads } = await supabase
        .from('leads')
        .select('phone')
        .eq('organization_id', campaign.organization_id)
        .limit(campaign.total_recipients);

      if (!leads || leads.length === 0) {
        console.log(`[Watchdog] No leads found for campaign ${campaign.id}`);
        continue;
      }

      const recipients = leads.map(l => l.phone);

      // Chama a função de dispatch para reiniciar
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/campaign-dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            campaignId: campaign.id,
            recipients: recipients,
            action: 'resume'
          }),
        });

        const result = await response.json();
        
        if (result.success) {
          console.log(`[Watchdog] ✓ Successfully restarted campaign ${campaign.id}`);
          restartedCampaigns.push(campaign.id);
        } else {
          console.error(`[Watchdog] ✗ Failed to restart campaign ${campaign.id}:`, result.error);
        }
      } catch (restartError) {
        console.error(`[Watchdog] Error restarting campaign ${campaign.id}:`, restartError);
      }
    }

    console.log(`[Watchdog] Completed. Restarted ${restartedCampaigns.length} campaign(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Watchdog check complete`,
        stalledFound: stalledCampaigns.length,
        restarted: restartedCampaigns.length,
        restartedCampaigns
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[Watchdog] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
