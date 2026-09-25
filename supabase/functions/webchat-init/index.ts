import { broadcast, corsHeaders, insertMessage, isUuid, json, loadActiveLink, localDb, msgDb, publicMessage, threadPhone } from "../_shared/webchat.ts";
import { pickDistribution } from "../_shared/assignment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { linkId, sessionId, visitorName } = await req.json().catch(() => ({}));
    if (!isUuid(linkId) || !isUuid(sessionId)) return json({ error: "Parâmetros inválidos" }, 400);
    const name = typeof visitorName === "string" && visitorName.trim() ? visitorName.trim().slice(0, 80) : null;

    const link = await loadActiveLink(linkId);
    if (!link) return json({ error: "Chat indisponível" }, 404);

    const orgId = link.organization_id as string;
    let channelId = link.channel_id as string | null;

    // Ensure channel exists (1 channel per link)
    if (!channelId) {
      const { data: owner } = await localDb.from("profiles").select("user_id").eq("organization_id", orgId).limit(1).maybeSingle();
      if (!owner) return json({ error: "Organização sem usuários" }, 500);
      const { data: ch, error: chErr } = await localDb.from("channels").insert({
        user_id: owner.user_id, organization_id: orgId, name: link.name,
        phone: `webchat:${link.id}`, provider: "web_chat", connected: true,
      }).select("id").single();
      if (chErr) throw chErr;
      channelId = ch.id;
      await localDb.from("webchat_links").update({ channel_id: channelId }).eq("id", link.id);
    }

    const phone = threadPhone(sessionId);

    // Lead anônimo: sem telefone; sessão salva em bsuid (fallback: leads antigos com phone=webchat:<id>)
    let leadId: string | null = null;
    const { data: existingLead } = await localDb.from("leads").select("id").eq("organization_id", orgId)
      .or(`bsuid.eq.${sessionId},phone.eq."${phone}"`).limit(1).maybeSingle();
    if (existingLead) {
      leadId = existingLead.id;
      if (name) await localDb.from("leads").update({ name }).eq("id", leadId);
    } else {
      const { data: owner } = await localDb.from("channels").select("user_id").eq("id", channelId).maybeSingle();
      const { data: lead } = await localDb.from("leads").insert({
        organization_id: orgId, user_id: owner?.user_id, name: name || `Visitante Web - ${sessionId.slice(0, 6)}`,
        phone: null, bsuid: sessionId, tags: ["web_chat"], status: "new", custom_fields: { source: "web_chat", link_id: link.id },
      }).select("id").maybeSingle();
      leadId = lead?.id ?? null;
    }

    // Assignment upsert
    let isNew = false;
    const { data: existing } = await msgDb.from("conversation_assignments").select("id")
      .eq("channel_id", channelId).eq("conversation_phone", phone).limit(1).maybeSingle();
    if (!existing) {
      // Mesma fila/setor do WhatsApp (setor padrão + round-robin)
      const dist = await pickDistribution(localDb, orgId);
      const { error: aErr } = await msgDb.from("conversation_assignments").insert({
        conversation_phone: phone, channel_id: channelId, organization_id: orgId, lead_id: leadId,
        status: dist.status, sector_id: dist.sectorId, assigned_to: dist.assignedTo,
        assigned_at: dist.assignedTo ? new Date().toISOString() : null,
      });
      // 23505 = outra requisição concorrente (ex.: duplo carregamento) já criou a conversa
      if (aErr && aErr.code !== "23505") throw aErr;
      isNew = !aErr;
    }

    if (isNew && link.greeting_message) {
      const m = await insertMessage({ channelId: channelId!, orgId, sessionId, content: link.greeting_message,
        direction: "outbound", senderName: link.name, linkId: link.id, extra: { greeting: true } });
      await broadcast(sessionId, publicMessage(m));
    }

    const { data: history } = await msgDb.from("whatsapp_messages")
      .select("id, content, direction, sender_name, created_at")
      .eq("channel_id", channelId).eq("sender_phone", phone)
      .order("created_at", { ascending: true }).limit(200);

    return json({
      link: { name: link.name, theme_color: link.theme_color },
      messages: (history || []).map(publicMessage),
    });
  } catch (e) {
    console.error("[webchat-init]", e);
    return json({ error: "Erro ao iniciar o chat" }, 500);
  }
});
