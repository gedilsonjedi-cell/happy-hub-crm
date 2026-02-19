import { useEffect, useRef, useCallback } from "react";
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

// Hook que processa campanhas rodando em loop contínuo no frontend
// Garante que campanhas NUNCA parem enquanto a página estiver aberta
export function useCampaignProcessor({ 
  campaigns, 
  onUpdate, 
  enabled = true 
}: UseCampaignProcessorOptions) {
  const processingRef = useRef<Set<string>>(new Set());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const getRandomInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const processNextBatch = useCallback(async (campaign: Campaign) => {
    if (processingRef.current.has(campaign.id)) {
      console.log(`[Processor] Already processing ${campaign.name}`);
      return;
    }

    if (campaign.status !== 'running') {
      console.log(`[Processor] Campaign ${campaign.name} is ${campaign.status}, stopping`);
      processingRef.current.delete(campaign.id);
      return;
    }

    processingRef.current.add(campaign.id);

    try {
      const isFullMode = (campaign.min_interval === 0 && campaign.max_interval === 0);
      const currentBatchSize = isFullMode ? 200 : 1;
      
      console.log(`[Processor] Sending batch for ${campaign.name} (${campaign.sent_count}/${campaign.total_recipients}) [batch=${currentBatchSize}]`);

      const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
        body: {
          campaignId: campaign.id,
          batchSize: currentBatchSize
        }
      });

      if (error) {
        console.error(`[Processor] Error for ${campaign.name}:`, error);
        // Stop processing if campaign was deleted (404)
        if (error.message?.includes('404') || error.message?.includes('Campaign not found')) {
          console.log(`[Processor] Campaign ${campaign.name} no longer exists, stopping`);
          processingRef.current.delete(campaign.id);
          timeoutsRef.current.delete(campaign.id);
          onUpdate();
          return;
        }
        const timeout = setTimeout(() => {
          processingRef.current.delete(campaign.id);
          processNextBatch(campaign);
        }, 5000);
        timeoutsRef.current.set(campaign.id, timeout);
        return;
      }

      console.log(`[Processor] Response for ${campaign.name}:`, data);
      onUpdate();

      if (!data.done && (data.status === 'running' || data.status === 'waiting_retry')) {
        let waitTime: number;
        
        if (data.status === 'waiting_retry') {
          waitTime = 60000;
          console.log(`[Processor] ${campaign.name}: ${data.pendingRetries || 0} retries pending, polling every 60s`);
        } else if (isFullMode) {
          // Full mode: no delay, fire next batch immediately
          waitTime = 100; // minimal delay just for event loop
          console.log(`[Processor] ${campaign.name}: FULL MODE — next batch immediately`);
        } else {
          const minInterval = campaign.min_interval || 5;
          const maxInterval = campaign.max_interval || 120;
          waitTime = getRandomInterval(minInterval, maxInterval) * 1000;
          console.log(`[Processor] ${campaign.name}: waiting ${waitTime/1000}s before next...`);
        }
        
        const timeout = setTimeout(() => {
          processingRef.current.delete(campaign.id);
          // Re-fetch campaign status before processing
          supabase
            .from('campaigns')
            .select('id, name, status, sent_count, total_recipients, min_interval, max_interval')
            .eq('id', campaign.id)
            .single()
            .then(({ data: updatedCampaign }) => {
              // Continue processing if running OR if there are pending retries
              if (updatedCampaign && (updatedCampaign.status === 'running' || data.pendingRetries > 0)) {
                processNextBatch(updatedCampaign as Campaign);
              }
            });
        }, waitTime);
        
        timeoutsRef.current.set(campaign.id, timeout);
      } else {
        console.log(`[Processor] ${campaign.name} completed! (${data.pendingRetries || 0} retries scheduled)`);
        processingRef.current.delete(campaign.id);
        onUpdate();
      }
    } catch (err) {
      console.error(`[Processor] Exception for ${campaign.name}:`, err);
      // Retry after 5 seconds
      const timeout = setTimeout(() => {
        processingRef.current.delete(campaign.id);
        processNextBatch(campaign);
      }, 5000);
      timeoutsRef.current.set(campaign.id, timeout);
    }
  }, [onUpdate]);

  // Start processing for any running campaigns
  useEffect(() => {
    if (!enabled) return;

    const runningCampaigns = campaigns.filter(c => c.status === 'running');

    for (const campaign of runningCampaigns) {
      // Only start if not already processing
      if (!processingRef.current.has(campaign.id) && !timeoutsRef.current.has(campaign.id)) {
        console.log(`[Processor] Starting processor for ${campaign.name}`);
        processNextBatch(campaign);
      }
    }
  }, [campaigns, enabled, processNextBatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      timeoutsRef.current.clear();
      processingRef.current.clear();
    };
  }, []);

  // Expose method to manually trigger processing
  const startProcessing = useCallback((campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      processNextBatch(campaign);
    }
  }, [campaigns, processNextBatch]);

  const stopProcessing = useCallback((campaignId: string) => {
    const timeout = timeoutsRef.current.get(campaignId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(campaignId);
    }
    processingRef.current.delete(campaignId);
  }, []);

  return {
    startProcessing,
    stopProcessing,
    isProcessing: (campaignId: string) => processingRef.current.has(campaignId) || timeoutsRef.current.has(campaignId)
  };
}