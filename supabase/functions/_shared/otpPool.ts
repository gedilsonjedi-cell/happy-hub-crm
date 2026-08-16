import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type OtpPoolEntry = {
  templateId: string;
  templateName: string;
  channelId: string;
  accessToken: string;
  phoneNumberId: string;
  wabaId: string | null;
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

  const { data: links, error: linksError } = await db
    .from("channel_templates")
    .select("template_id, channel_id")
    .in("template_id", list.map((t) => t.id));

  if (linksError) {
    console.error("[getOtpPool] erro ao ler channel_templates:", linksError.message);
    return [];
  }

  const channelIds = Array.from(new Set(((links as any[]) || []).map((l) => l.channel_id)));
  if (channelIds.length === 0) return [];

  // `channels` não tem coluna `is_active` (o flag de conexão é `connected`).
  const { data: channels, error: channelsError } = await db
    .from("channels")
    .select("id, access_token, app_name, connected")
    .in("id", channelIds);

  if (channelsError) {
    console.error("[getOtpPool] erro ao ler channels:", channelsError.message);
    return [];
  }

  // Fallback do token: channel_secrets é a fonte segura quando o token está revogado na tabela channels.
  const { data: secrets } = await db
    .from("channel_secrets")
    .select("channel_id, access_token")
    .in("channel_id", channelIds);
  const secretByChannel = new Map(((secrets as any[]) || []).map((s) => [s.channel_id, s.access_token]));

  const channelById = new Map(((channels as any[]) || []).map((c) => [c.id, c]));

  const pool: OtpPoolEntry[] = [];
  for (const template of list) {
    const link = ((links as any[]) || []).find((l) => l.template_id === template.id);
    if (!link) continue;
    const channel = channelById.get(link.channel_id);
    if (!channel) continue;
    const accessToken = channel.access_token || secretByChannel.get(channel.id);
    if (!accessToken || !channel.app_name) continue;
    pool.push({
      templateId: template.id,
      templateName: template.name,
      channelId: channel.id,
      accessToken,
      phoneNumberId: channel.app_name,
    });
  }
  return pool;
}
