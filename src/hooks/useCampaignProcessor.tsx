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
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Lock to prevent concurrent batch calls for the same campaign
  const activeBatchRef = useRef<Set<string>>(new Set());

  const getRandomInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const processNextBatch = useCallback(async (campaign: Campaign) => {
    // Prevent concurrent batch calls for same campaign (critical for full mode)
    if (activeBatchRef.current.has(campaign.id)) {
      return;
    }

    if (campaign.status !== 'running') {
      processingRef.current.delete(campaign.id);
      activeBatchRef.current.delete(campaign.id);
      return;
    }

    activeBatchRef.current.add(campaign.id);
    processingRef.current.add(campaign.id);

    try {
      const isFullMode = (campaign.min_interval === 0 && campaign.max_interval === 0);
      const requestBody = isFullMode
        ? { campaignId: campaign.id, batchSize: 99 }
        : { campaignId: campaign.id };

      const { data, error } = await supabase.functions.invoke('send-campaign-batch', {
        body: requestBody
      });

      activeBatchRef.current.delete(campaign.id);

      if (error) {
        if (error.message?.includes('404') || error.message?.includes('Campaign not found')) {
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

      onUpdate();

      if (!data.done && (data.status === 'running' || data.status === 'waiting_retry')) {
        let waitTime: number;

        if (data.status === 'waiting_retry') {
          waitTime = 60000;
        } else if (isFullMode) {
          waitTime = 500;
        } else {
          const minInterval = campaign.min_interval || 5;
          const maxInterval = campaign.max_interval || 120;
          waitTime = getRandomInterval(minInterval, maxInterval) * 1000;
        }

        const timeout = setTimeout(() => {
          processingRef.current.delete(campaign.id);
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
        processingRef.current.delete(campaign.id);
        onUpdate();
      }
    } catch (err) {
      activeBatchRef.current.delete(campaign.id);
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
      if (!processingRef.current.has(campaign.id) && !timeoutsRef.current.has(campaign.id)) {
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
      activeBatchRef.current.clear();
    };
  }, []);

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
    activeBatchRef.current.delete(campaignId);
  }, []);

  return {
    startProcessing,
    stopProcessing,
    isProcessing: (campaignId: string) => processingRef.current.has(campaignId) || timeoutsRef.current.has(campaignId)
  };
}
