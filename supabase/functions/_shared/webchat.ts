import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const localDb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
/** DB where whatsapp_messages / conversation_assignments live */
export const msgDb = extUrl && extKey ? createClient(extUrl, extKey, { auth: { persistSession: false } }) : localDb;

export const threadPhone = (sessionId: string) => `webchat:${sessionId}`;

export async function loadActiveLink(linkId: string) {
  const { data } = await localDb
    .from("webchat_links")
    .select("id, organization_id, channel_id, name, greeting_message, theme_color, is_active")
    .eq("id", linkId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data;
}

export async function broadcast(sessionId: string, payload: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: `webchat:${sessionId}`, event: "message", payload }] }),
    });
  } catch (e) {
    console.error("[webchat] broadcast failed", e);
  }
}

export const publicMessage = (m: any) => ({
  id: m.id,
  content: m.content,
  direction: m.direction,
  sender_name: m.sender_name,
  created_at: m.created_at,
});

export async function insertMessage(opts: {
  channelId: string; orgId: string; sessionId: string; content: string;
  direction: "inbound" | "outbound"; senderName: string | null; linkId: string; extra?: Record<string, unknown>;
}) {
  const { data, error } = await msgDb.from("whatsapp_messages").insert({
    channel_id: opts.channelId,
    organization_id: opts.orgId,
    message_id: `webchat_${crypto.randomUUID()}`,
    sender_phone: threadPhone(opts.sessionId),
    sender_name: opts.senderName,
    message_type: "text",
    content: opts.content,
    direction: opts.direction,
    status: opts.direction === "outbound" ? "sent" : "received",
    is_read: opts.direction === "outbound",
    metadata: { source: "web_chat", link_id: opts.linkId, ...(opts.extra || {}) },
  }).select("id, content, direction, sender_name, created_at").single();
  if (error) throw error;
  return data;
}
