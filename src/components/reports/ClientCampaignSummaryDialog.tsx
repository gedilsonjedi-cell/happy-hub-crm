import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CampaignTrafficItem } from "@/hooks/useCampaignTraffic";

interface Props {
  campaign: CampaignTrafficItem | null;
  onOpenChange: (open: boolean) => void;
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1).replace(".", ",")}%` : "0%");

/**
 * Engajamento = Respostas ÷ Destinatários processados (enviados + falhas),
 * mesma definição do DispatchReportSender, restrita aos canais e à janela da campanha.
 */
async function fetchCampaignEngagement(campaignId: string, processed: number) {
  const { data: camp } = await supabase
    .from("campaigns")
    .select("started_at, completed_at, created_at")
    .eq("id", campaignId)
    .maybeSingle();
  const { data: chans } = await supabase
    .from("campaign_channels")
    .select("channel_id")
    .eq("campaign_id", campaignId);
  const channelIds = (chans || []).map((c) => c.channel_id);
  if (!camp || channelIds.length === 0) return { responses: 0, processed };
  const start = camp.started_at || camp.created_at;
  const end = camp.completed_at || new Date().toISOString();
  let responses = 0;
  let from = 0;
  for (;;) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .in("channel_id", channelIds)
      .eq("direction", "inbound")
      .gte("created_at", start)
      .lte("created_at", end)
      .range(from, from + 999);
    const rows = data || [];
    responses += rows.length;
    if (rows.length < 1000) break;
    from += 1000;
  }
  return { responses, processed };
}

export function ClientCampaignSummaryDialog({ campaign, onOpenChange }: Props) {
  const okSent = campaign ? Math.max(0, campaign.sentCount - campaign.failedCount) : 0;
  const processed = okSent + (campaign?.failedCount || 0);

  const { data: eng, isLoading } = useQuery({
    queryKey: ["client-summary-engagement", campaign?.id],
    queryFn: () => fetchCampaignEngagement(campaign!.id, processed),
    enabled: !!campaign,
  });

  if (!campaign) return null;
  const clicks = campaign.linkClickCount + campaign.refusalCount;
  const clickRate = pct(clicks, campaign.deliveredCount);
  const delivered = campaign.deliveredCount.toLocaleString("pt-BR");
  const cost = "Não disponível";
  const engagement = eng ? pct(eng.responses, eng.processed) : "…";

  const items = [
    { label: "Taxa de cliques", value: clickRate },
    { label: "Mensagens entregues", value: delivered },
    { label: "Valor gasto no disparo", value: cost },
    { label: "Engajamento", value: isLoading ? "…" : engagement },
  ];

  const copy = async () => {
    const text = [
      `*Resumo da campanha: ${campaign.name}*`,
      "",
      ...items.map((i) => `${i.label}: *${i.value}*`),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Resumo copiado");
  };

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resumo para o cliente</DialogTitle>
          <DialogDescription className="truncate">{campaign.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {items.map((i) => (
            <div key={i.label} className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground">{i.label}</div>
              <div className="mt-1 text-2xl font-bold">{i.value}</div>
            </div>
          ))}
        </div>
        <Button onClick={copy} disabled={isLoading} className="w-full">
          <Copy className="w-4 h-4 mr-2" /> Copiar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
