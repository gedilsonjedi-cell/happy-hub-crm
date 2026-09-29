import { createClient } from "npm:@supabase/supabase-js@2";
import { broadcast, corsHeaders, insertMessage, isUuid, json, localDb, msgDb, publicMessage } from "../_shared/webchat.ts";
import { sendPushToSession } from "../_shared/webpush.ts";

/** Resposta do atendente para uma conversa de Web Chat (sem API externa). */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const { channelId, destination, message } = await req.json().catch(() => ({}));
    const text = typeof message === "string" ? message.trim() : "";
    if (!isUuid(channelId) || typeof destination !== "string" || !text || text.length > 4000) return json({ error: "Parâmetros inválidos" }, 400);

    const { data: channel } = await localDb.from("channels").select("id, organization_id, provider").eq("id", channelId).maybeSingle();
    if (!channel || channel.provider !== "web_chat") return json({ error: "Canal inválido" }, 404);

    const [{ data: profile }, { data: sa }] = await Promise.all([
      localDb.from("profiles").select("organization_id, display_name").eq("user_id", u.user.id).maybeSingle(),
      localDb.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "super_admin").maybeSingle(),
    ]);
    if (!sa && profile?.organization_id !== channel.organization_id) return json({ error: "Acesso negado" }, 403);

    // destination may arrive as "webchat:<uuid>" or digits-stripped; recover session id
    const match = destination.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i);
    let sessionId = match?.[0] ?? "";
    if (sessionId && !sessionId.includes("-")) sessionId = sessionId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    if (!isUuid(sessionId)) return json({ error: "Esta conversa não é de Web Chat (sem sessão do visitante). Responda pelo canal de WhatsApp." }, 400);

    const { data: link } = await localDb.from("webchat_links").select("id").eq("channel_id", channelId).maybeSingle();

    const m = await insertMessage({ channelId, orgId: channel.organization_id, sessionId, content: text,
      direction: "outbound", senderName: profile?.display_name || "Atendente", linkId: link?.id ?? "", extra: { sent_by: u.user.id } });

    await msgDb.rpc("upsert_conversation_stats_external", {
      _organization_id: channel.organization_id, _channel_id: channelId, _conversation_phone: `webchat:${sessionId}`,
      _content: text, _direction: "outbound", _is_read: true, _sender_name: null, _created_at: m.created_at,
    }).then(() => {}, () => {});

    await broadcast(sessionId, publicMessage(m));
    const { data: linkInfo } = link?.id
      ? await localDb.from("webchat_links").select("name, slug").eq("id", link.id).maybeSingle()
      : { data: null };
    await sendPushToSession(sessionId, {
      title: linkInfo?.name || "Nova mensagem",
      body: text.length > 140 ? `${text.slice(0, 137)}...` : text,
      tag: `webchat-${sessionId}`,
      url: linkInfo?.slug ? `/c/${linkInfo.slug}` : link?.id ? `/chat/${link.id}` : "/",
    }).catch((e) => console.error("[webchat-reply] push", e));
    return json({ success: true, messageId: m.id });
  } catch (e) {
    console.error("[webchat-reply]", e);
    return json({ error: "Erro ao enviar" }, 500);
  }
});
