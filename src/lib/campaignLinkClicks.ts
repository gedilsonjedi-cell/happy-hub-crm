import { supabase } from "@/integrations/supabase/client";

/**
 * Cliques no link curto (botão "Consultar") atribuídos à campanha via ?cid=.
 * Só existem para cliques registrados depois do rastreio por campanha.
 */
export async function fetchCampaignLinkClicks(
  campaignIds: string[],
  start?: string,
  end?: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (campaignIds.length === 0) return map;
  const BATCH = 200;
  for (let i = 0; i < campaignIds.length; i += BATCH) {
    const { data, error } = await (supabase as any).rpc("get_campaign_link_clicks", {
      p_campaign_ids: campaignIds.slice(i, i + BATCH),
      p_start: start ?? null,
      p_end: end ?? null,
    });
    if (error) {
      console.warn("[campaignLinkClicks] falhou", error);
      continue;
    }
    for (const row of (data || []) as Array<{ campaign_id: string; clicks: number }>) {
      map.set(row.campaign_id, (map.get(row.campaign_id) || 0) + Number(row.clicks || 0));
    }
  }
  return map;
}

export const sumClicks = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
