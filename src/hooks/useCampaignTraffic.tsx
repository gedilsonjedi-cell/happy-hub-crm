import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import { useAuth } from "./useAuth";

export interface CampaignTrafficItem {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  interactedCount: number;
  createdAt: string;
}

export function useCampaignTraffic() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-traffic", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      const { data: campaigns, error } = await supabase
        .from("campaigns")
        .select("id, name, status, total_recipients, sent_count, delivered_count, failed_count, created_at")
        .eq("organization_id", effectiveOrganizationId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) return [];

      // Get authoritative counters from campaign_recipients via RPC.
      // The aggregated columns on campaigns can be stale (webhooks may arrive
      // out-of-order or be missed), so we always prefer the real per-recipient counts.
      const campaignIds = campaigns.map(c => c.id);
      const realCounts = new Map<string, {
        sent: number; delivered: number; failed: number; read: number; interacted: number; recipients: number;
      }>();

      const { data: counts, error: countsError } = await supabase
        .rpc("get_campaign_real_counts", { p_campaign_ids: campaignIds });

      if (countsError) {
        console.warn("[useCampaignTraffic] get_campaign_real_counts failed", countsError);
      } else if (counts) {
        for (const row of counts as Array<{
          campaign_id: string;
          recipients_count: number;
          sent_count: number;
          delivered_count: number;
          read_count: number;
          failed_count: number;
          interacted_count: number;
        }>) {
          realCounts.set(row.campaign_id, {
            recipients: Number(row.recipients_count) || 0,
            sent: Number(row.sent_count) || 0,
            delivered: Number(row.delivered_count) || 0,
            read: Number(row.read_count) || 0,
            failed: Number(row.failed_count) || 0,
            interacted: Number(row.interacted_count) || 0,
          });
        }
      }

      const results: CampaignTrafficItem[] = campaigns.map((c) => {
        const real = realCounts.get(c.id);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          totalRecipients: c.total_recipients,
          sentCount: real ? real.sent : c.sent_count,
          deliveredCount: real ? real.delivered : c.delivered_count,
          failedCount: real ? real.failed : c.failed_count,
          readCount: real ? real.read : 0,
          interactedCount: real ? real.interacted : 0,
          createdAt: c.created_at,
        };
      });

      return results;
    },
    enabled: !!user && !!effectiveOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  return { campaigns: data || [], loading: isLoading };
}
