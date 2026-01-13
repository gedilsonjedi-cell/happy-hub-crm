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
      console.log(`[Processor] Sending batch for ${campaign.name} (${campaign.sent_count}/${campaign.total_recipients})`);

      const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
        body: {
          campaignId: campaign.id,
          batchSize: 1 // Envia 1 por vez para controle preciso do intervalo
        }
      });

      if (error) {
        console.error(`[Processor] Error for ${campaign.name}:`, error);
        // Retry after 5 seconds on error
        const timeout = setTimeout(() => {
          processingRef.current.delete(campaign.id);
          processNextBatch(campaign);
        }, 5000);
        timeoutsRef.current.set(campaign.id, timeout);
        return;
      }

      console.log(`[Processor] Response for ${campaign.name}:`, data);

      // Update UI
      onUpdate();

      // If not done, schedule next batch
      // IMPORTANT: Also continue polling when status is 'waiting_retry' to pick up retries when they're ready
      if (!data.done && (data.status === 'running' || data.status === 'waiting_retry')) {
        let waitTime: number;
        
        if (data.status === 'waiting_retry') {
          // When waiting for retries, poll every 30 seconds to check if any retry is ready
          waitTime = 30000;
          console.log(`[Processor] ${campaign.name}: ${data.pendingRetries} retries pending, polling every 30s`);
        } else {
          // Normal interval for sending
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
              if (updatedCampaign && updatedCampaign.status === 'running') {
                processNextBatch(updatedCampaign as Campaign);
              }
            });
        }, waitTime);
        
        timeoutsRef.current.set(campaign.id, timeout);
      } else {
        console.log(`[Processor] ${campaign.name} completed!`);
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