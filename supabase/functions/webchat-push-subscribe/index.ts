import { corsHeaders, isLinkKey, isUuid, json, loadActiveLink, msgDb, threadPhone, localDb } from "../_shared/webchat.ts";
import { getVapid } from "../_shared/webpush.ts";

/** Visitante do Web Chat: obtém a chave pública ou registra a inscrição de avisos. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { action, linkId, sessionId, subscription } = await req.json().catch(() => ({}));
    if (!isLinkKey(linkId) || !isUuid(sessionId)) return json({ error: "Parâmetros inválidos" }, 400);
    const link = await loadActiveLink(linkId);
    if (!link || !link.channel_id) return json({ error: "Chat indisponível" }, 404);

    if (action === "key") return json({ publicKey: (await getVapid()).publicKey });

    const ep = subscription?.endpoint, p256dh = subscription?.keys?.p256dh, authK = subscription?.keys?.auth;
    if (typeof ep !== "string" || !/^https:\/\//.test(ep) || ep.length > 1000 || typeof p256dh !== "string" || typeof authK !== "string"
      || p256dh.length > 200 || authK.length > 100) return json({ error: "Inscrição inválida" }, 400);

    // Só sessões que já iniciaram conversa neste link
    const { data: a } = await msgDb.from("conversation_assignments").select("id")
      .eq("channel_id", link.channel_id).eq("conversation_phone", threadPhone(sessionId)).limit(1).maybeSingle();
    if (!a) return json({ error: "Sessão não iniciada" }, 409);

    const { error } = await localDb.from("webchat_push_subscriptions").upsert({
      endpoint: ep, session_id: sessionId, link_id: link.id, organization_id: link.organization_id,
      subscription: { endpoint: ep, keys: { p256dh, auth: authK } }, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    console.error("[webchat-push-subscribe]", e);
    return json({ error: "Erro ao ativar avisos" }, 500);
  }
});
