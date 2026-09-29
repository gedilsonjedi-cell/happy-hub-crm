import { broadcast, corsHeaders, insertMessage, isLinkKey, isUuid, json, loadActiveLink, localDb, msgDb, publicMessage, threadPhone } from "../_shared/webchat.ts";
import { pickDistribution } from "../_shared/assignment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { linkId, sessionId, visitorName, leadId: magicLeadId } = await req.json().catch(() => ({}));
    if (!isLinkKey(linkId) || !isUuid(sessionId)) return json({ error: "Parâmetros inválidos" }, 400);
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

    // Lead anônimo: phone SEMPRE NULL; identificado por webchat_id curto + sessão em bsuid.
    let leadId: string | null = null;
    // Link Mágico: lead existente do CRM (mesma organização) assume a sessão — sem contato anônimo.
    let magicLead: { id: string; name: string } | null = null;
    if (isUuid(magicLeadId)) {
      const { data } = await localDb.from("leads").select("id, name").eq("id", magicLeadId).eq("organization_id", orgId).maybeSingle();
      magicLead = data ?? null;
    }
    const { data: existingLead } = magicLead ? { data: null } : await localDb.from("leads").select("id, webchat_id").eq("organization_id", orgId)
      .or(`bsuid.eq.${sessionId},phone.eq."${phone}"`).limit(1).maybeSingle();
    if (magicLead) leadId = magicLead.id;
    const newCode = () => String(Math.floor(10000 + Math.random() * 90000));
    if (magicLead) {
      // nada a criar
    } else if (existingLead) {
      leadId = existingLead.id;
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (!existingLead.webchat_id) { const c = newCode(); patch.webchat_id = c; if (!name) patch.name = `Web Chat #${c}`; patch.phone = null; }
      if (Object.keys(patch).length) await localDb.from("leads").update(patch).eq("id", leadId);
    } else {
      const { data: owner } = await localDb.from("channels").select("user_id").eq("id", channelId).maybeSingle();
      for (let i = 0; i < 5 && !leadId; i++) {
        const code = newCode();
        const { data: lead, error: lErr } = await localDb.from("leads").insert({
          organization_id: orgId, user_id: owner?.user_id, name: name || `Web Chat #${code}`,
          phone: null, webchat_id: code, bsuid: sessionId, tags: ["web_chat"], status: "new",
          custom_fields: { source: "web_chat", link_id: link.id },
        }).select("id").maybeSingle();
        if (lErr && lErr.code !== "23505") { console.error("[webchat-init] lead", lErr); break; }
        leadId = lead?.id ?? null;
      }
    }

    // Assignment upsert
    let isNew = false;
    const { data: existing } = await msgDb.from("conversation_assignments").select("id, lead_id")
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
    } else if (magicLead && existing.lead_id !== magicLead.id) {
      await msgDb.from("conversation_assignments").update({ lead_id: magicLead.id, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }

    // Radar de Abandono: avisa o atendente que o cliente abriu o link
    if (magicLead) {
      const content = "👀 O cliente abriu o link do Web Chat, mas ainda não iniciou a conversa.";
      const { data: log } = await msgDb.from("whatsapp_messages").insert({
        channel_id: channelId, organization_id: orgId, message_id: `webchat_radar_${crypto.randomUUID()}`,
        sender_phone: phone, sender_name: magicLead.name, message_type: "system_log", content,
        direction: "inbound", status: "received", is_read: false,
        metadata: { source: "web_chat", link_id: link.id, system_log: "link_opened", lead_id: magicLead.id },
      }).select("created_at").single();
      await msgDb.rpc("upsert_conversation_stats_external", {
        _organization_id: orgId, _channel_id: channelId, _conversation_phone: phone, _content: content,
        _direction: "inbound", _is_read: false, _sender_name: magicLead.name, _created_at: log?.created_at ?? new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    if (isNew && link.greeting_message) {
      const m = await insertMessage({ channelId: channelId!, orgId, sessionId, content: link.greeting_message,
        direction: "outbound", senderName: link.name, linkId: link.id, extra: { greeting: true } });
      await broadcast(sessionId, publicMessage(m));
    }

    const { data: history } = await msgDb.from("whatsapp_messages")
      .select("id, content, direction, sender_name, created_at, message_type, media_url, status")
      .eq("channel_id", channelId).eq("sender_phone", phone).neq("message_type", "system_log")
      .order("created_at", { ascending: true }).limit(200);

    return json({
      link: { name: link.name, theme_color: link.theme_color, prefill_text: link.prefill_text ?? null },
      messages: (history || []).map(publicMessage),
    });
  } catch (e) {
    console.error("[webchat-init]", e);
    return json({ error: "Erro ao iniciar o chat" }, 500);
  }
});
