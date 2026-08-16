import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type OtpPoolEntry = {
  templateId: string;
  templateName: string;
  channelId: string;
  accessToken: string;
  phoneNumberId: string;
};

/**
 * Pool de envio do OTP: todos os templates de autenticação com `otp_active = true`
 * que tenham um canal (BM) vinculado com credenciais válidas.
 * A ordem devolvida é "menos usado recentemente" primeiro (rodízio entre BMs).
 */
export async function getOtpPool(db: SupabaseClient): Promise<OtpPoolEntry[]> {
  const { data: templates } = await db
    .from("message_templates")
    .select("id, name, otp_last_used_at")
    .eq("otp_active", true)
    .eq("dispatch_type", "service")
    .order("otp_last_used_at", { ascending: true, nullsFirst: true });

  const list = (templates as Array<{ id: string; name: string }> | null) || [];
  if (list.length === 0) return [];

  const { data: links } = await db
    .from("channel_templates")
    .select("template_id, channel_id")
    .in("template_id", list.map((t) => t.id));

  const channelIds = Array.from(new Set(((links as any[]) || []).map((l) => l.channel_id)));
  if (channelIds.length === 0) return [];

  const { data: channels } = await db
    .from("channels")
    .select("id, access_token, app_name, is_active")
    .in("id", channelIds);

  const channelById = new Map(((channels as any[]) || []).map((c) => [c.id, c]));

  const pool: OtpPoolEntry[] = [];
  for (const template of list) {
    const link = ((links as any[]) || []).find((l) => l.template_id === template.id);
    if (!link) continue;
    const channel = channelById.get(link.channel_id);
    if (!channel?.access_token || !channel?.app_name) continue;
    pool.push({
      templateId: template.id,
      templateName: template.name,
      channelId: channel.id,
      accessToken: channel.access_token,
      phoneNumberId: channel.app_name,
    });
  }
  return pool;
}
