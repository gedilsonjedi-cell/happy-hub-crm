import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Eye, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

interface RunningCampaign {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  started_at?: string | null;
  min_interval?: number;
  max_interval?: number;
}

interface CampaignProgressBarProps {
  onViewDetails: (campaignId: string) => void;
}

// Simple debounce function
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function CampaignProgressBar({ onViewDetails }: CampaignProgressBarProps) {
  const [runningCampaigns, setRunningCampaigns] = useState<RunningCampaign[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const previousDataRef = useRef<string>("");

  const fetchRunningCampaigns = useCallback(async () => {
    if (!effectiveOrganizationId) return;
    
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "running")
      .eq("organization_id", effectiveOrganizationId)
      .order("started_at", { ascending: false });

    if (!error && data) {
      const newDataString = JSON.stringify(data);
      if (newDataString !== previousDataRef.current) {
        previousDataRef.current = newDataString;
        // Always use the latest values from database (source of truth)
        setRunningCampaigns(data);
      }
    }
  }, [effectiveOrganizationId]);

  // Debounced version for realtime updates (1 second delay)
  const debouncedFetch = useMemo(
    () => debounce(fetchRunningCampaigns, 1000),
    [fetchRunningCampaigns]
  );

  useEffect(() => {
    if (!effectiveOrganizationId) return;
    
    // Initial fetch
    fetchRunningCampaigns();

    // Set up realtime subscription with debounced updates
    const channel = supabase
      .channel("running-campaigns")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaigns",
          filter: "status=eq.running",
        },
        () => {
          // Use debounced fetch to prevent flickering from rapid updates
          debouncedFetch();
        }
      )
      .subscribe();

    // Poll every 10 seconds as fallback (increased from 5 to reduce load)
    const pollInterval = setInterval(fetchRunningCampaigns, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [effectiveOrganizationId, fetchRunningCampaigns, debouncedFetch]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRunningCampaigns();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (runningCampaigns.length === 0) return null;

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <h3 className="text-sm font-medium text-foreground">Disparos em Andamento</h3>
          <Badge variant="secondary" className="text-xs">{runningCampaigns.length}</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleRefresh}
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-3">
        {runningCampaigns.map((campaign) => {
          // Progress: sent + failed vs total (sent includes delivered+read)
          const processedCount = campaign.sent_count + campaign.failed_count;
          const progress = campaign.total_recipients > 0
            ? Math.min(100, Math.round((processedCount / campaign.total_recipients) * 100))
            : 0;
          
          const isFinishing = processedCount >= campaign.total_recipients;
          
          // Estimate remaining time based on pending recipients
          const pendingCount = Math.max(0, campaign.total_recipients - processedCount);
          const avgInterval = ((campaign.min_interval || 5) + (campaign.max_interval || 120)) / 2;
          const estimatedMinutes = Math.ceil((pendingCount * avgInterval) / 60);

          return (
            <div 
              key={campaign.id}
              className="bg-card rounded-lg p-3 border border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-foreground text-sm">{campaign.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {processedCount} / {campaign.total_recipients}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onViewDetails(campaign.id)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Detalhes
                  </Button>
                </div>
              </div>
              
              <Progress value={progress} className="h-2 bg-muted" />
              
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-purple-400">📤 {campaign.sent_count} enviadas</span>
                  <span className="text-green-400">✓ {campaign.delivered_count} entregues</span>
                  {campaign.failed_count > 0 && (
                    <span className="text-destructive">✗ {campaign.failed_count} falhas</span>
                  )}
                </div>
                <span>
                  {isFinishing 
                    ? `${progress}% • Finalizando...` 
                    : `${progress}% • ~${estimatedMinutes} min restantes`
                  }
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
