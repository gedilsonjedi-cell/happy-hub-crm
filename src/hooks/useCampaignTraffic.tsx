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
      if (!campaigns) return [];

      const results: CampaignTrafficItem[] = [];

      for (const c of campaigns) {
        // Get read & interacted counts
        const { count: readCount } = await supabase
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .not("read_at", "is", null);

        const { count: interactedCount } = await supabase
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .not("button_clicked", "is", null);

        results.push({
          id: c.id,
          name: c.name,
          status: c.status,
          totalRecipients: c.total_recipients,
          sentCount: c.sent_count,
          deliveredCount: c.delivered_count,
          failedCount: c.failed_count,
          readCount: readCount || 0,
          interactedCount: interactedCount || 0,
          createdAt: c.created_at,
        });
      }

      return results;
    },
    enabled: !!user && !!effectiveOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  return { campaigns: data || [], loading: isLoading };
}
