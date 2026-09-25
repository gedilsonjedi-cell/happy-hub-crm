import { broadcast, corsHeaders, insertMessage, isUuid, json, loadActiveLink, localDb, msgDb, publicMessage, threadPhone } from "../_shared/webchat.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { linkId, sessionId, content } = await req.json().catch(() => ({}));
    if (!isUuid(linkId) || !isUuid(sessionId)) return json({ error: "Parâmetros inválidos" }, 400);
    const text = typeof content === "string" ? content.trim() : "";
    if (!text || text.length > 4000) return json({ error: "Mensagem inválida" }, 400);

    const link = await loadActiveLink(linkId);
    if (!link || !link.channel_id) return json({ error: "Chat indisponível" }, 404);

    const phone = threadPhone(sessionId);
    const { data: assignment } = await msgDb.from("conversation_assignments").select("id, status")
      .eq("channel_id", link.channel_id).eq("conversation_phone", phone).limit(1).maybeSingle();
    if (!assignment) return json({ error: "Sessão não iniciada" }, 409);

    const { data: lead } = await localDb.from("leads").select("name").eq("organization_id", link.organization_id).eq("phone", phone).limit(1).maybeSingle();

    const m = await insertMessage({ channelId: link.channel_id, orgId: link.organization_id, sessionId, content: text,
      direction: "inbound", senderName: lead?.name || "Visitante", linkId: link.id });

    if (assignment.status === "archived" || assignment.status === "resolved") {
      await msgDb.from("conversation_assignments").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", assignment.id);
    } else {
      await msgDb.from("conversation_assignments").update({ updated_at: new Date().toISOString() }).eq("id", assignment.id);
    }

    await msgDb.rpc("upsert_conversation_stats_external", {
      _organization_id: link.organization_id, _channel_id: link.channel_id, _conversation_phone: phone,
      _content: text, _direction: "inbound", _is_read: false, _sender_name: lead?.name || "Visitante", _created_at: m.created_at,
    }).then(() => {}, () => {});

    await broadcast(sessionId, publicMessage(m));
    return json({ message: publicMessage(m) });
  } catch (e) {
    console.error("[webchat-send]", e);
    return json({ error: "Erro ao enviar" }, 500);
  }
});
