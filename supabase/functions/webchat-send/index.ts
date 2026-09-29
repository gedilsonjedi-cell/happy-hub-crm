import { broadcast, corsHeaders, insertMessage, isLinkKey, isUuid, json, loadActiveLink, localDb, msgDb, publicMessage, threadPhone } from "../_shared/webchat.ts";
import { pickDistribution } from "../_shared/assignment.ts";
import { uploadToExternalMedia } from "../_shared/externalStorage.ts";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 300;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a",
]);

const extensionFor = (mime: string) => {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  return "webm";
};

async function toMp3(buf: ArrayBuffer, mime: string): Promise<ArrayBuffer | null> {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME"), key = Deno.env.get("CLOUDINARY_API_KEY"), secret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloud || !key || !secret) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`format=mp3&timestamp=${timestamp}${secret}`));
  const signature = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), `webchat.${extensionFor(mime)}`);
  fd.append("timestamp", timestamp); fd.append("api_key", key); fd.append("signature", signature); fd.append("format", "mp3");
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`cloudinary ${r.status} ${await r.text()}`);
  const { secure_url } = await r.json();
  const f = await fetch(secure_url);
  return f.ok ? await f.arrayBuffer() : null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const requestType = req.headers.get("content-type") || "";
    let linkId: unknown;
    let sessionId: unknown;
    let content: unknown;
    let audio: File | null = null;
    let duration = 0;

    if (requestType.includes("multipart/form-data")) {
      const form = await req.formData();
      linkId = form.get("linkId");
      sessionId = form.get("sessionId");
      content = "[Áudio]";
      const candidate = form.get("audio");
      audio = candidate instanceof File ? candidate : null;
      duration = Number(form.get("duration") || 0);
    } else {
      const body = await req.json().catch(() => ({}));
      linkId = body.linkId;
      sessionId = body.sessionId;
      content = body.content;
    }
    if (!isLinkKey(linkId) || !isUuid(sessionId)) return json({ error: "Parâmetros inválidos" }, 400);
    const text = typeof content === "string" ? content.trim() : "";
    if (!text || text.length > 4000) return json({ error: "Mensagem inválida" }, 400);

    if (audio) {
      const mime = audio.type.split(";")[0].toLowerCase();
      if (!ALLOWED_AUDIO_TYPES.has(mime)) return json({ error: "Formato de áudio não permitido" }, 400);
      if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) return json({ error: "O áudio deve ter no máximo 10 MB" }, 400);
      if (!Number.isFinite(duration) || duration < 1 || duration > MAX_AUDIO_SECONDS) {
        return json({ error: "O áudio deve ter entre 1 segundo e 5 minutos" }, 400);
      }
    } else if (requestType.includes("multipart/form-data")) {
      return json({ error: "Áudio ausente" }, 400);
    }

    const link = await loadActiveLink(linkId);
    if (!link || !link.channel_id) return json({ error: "Chat indisponível" }, 404);

    const phone = threadPhone(sessionId);
    const { data: assignment } = await msgDb.from("conversation_assignments").select("id, status, assigned_to, sector_id, lead_id")
      .eq("channel_id", link.channel_id).eq("conversation_phone", phone).limit(1).maybeSingle();
    if (!assignment) return json({ error: "Sessão não iniciada" }, 409);

    const { data: lead } = assignment.lead_id
      ? await localDb.from("leads").select("name").eq("id", assignment.lead_id).eq("organization_id", link.organization_id).maybeSingle()
      : await localDb.from("leads").select("name").eq("organization_id", link.organization_id).or(`bsuid.eq.${sessionId},phone.eq."${phone}"`).limit(1).maybeSingle();

    let mediaUrl: string | null = null;
    if (audio) {
      // WebM/OGG não toca em Safari/iPhone e costuma vir sem duração: converte para MP3
      let bytes: ArrayBuffer = await audio.arrayBuffer();
      let mime = audio.type.split(";")[0];
      if (!mime.includes("mpeg") && !mime.includes("mp4") && !mime.includes("m4a") && !mime.includes("aac")) {
        const mp3 = await toMp3(bytes, mime).catch((e) => { console.error("[webchat-send] mp3", e); return null; });
        if (mp3) { bytes = mp3; mime = "audio/mpeg"; }
      }
      const path = `${link.organization_id}/webchat/${sessionId}/${Date.now()}_${crypto.randomUUID()}.${extensionFor(mime)}`;
      mediaUrl = await uploadToExternalMedia(path, bytes, mime);
      if (!mediaUrl) return json({ error: "Não foi possível armazenar o áudio" }, 500);
    }

    const messageType = audio ? "audio" : "text";
    const m = await insertMessage({ channelId: link.channel_id, orgId: link.organization_id, sessionId, content: text,
      direction: "inbound", senderName: lead?.name || "Visitante", linkId: link.id,
      messageType, mediaUrl, extra: audio ? { duration_seconds: duration } : undefined });

    const now = new Date().toISOString();
    const reopened = assignment.status === "archived" || assignment.status === "resolved";
    if (!assignment.assigned_to) {
      // Ainda sem atendente: tenta distribuir; update condicional evita dois donos
      const dist = await pickDistribution(localDb, link.organization_id, assignment.sector_id);
      await msgDb.from("conversation_assignments").update({
        status: dist.assignedTo ? "in_progress" : "pending", sector_id: dist.sectorId, assigned_to: dist.assignedTo,
        assigned_at: dist.assignedTo ? now : null, updated_at: now,
      }).eq("id", assignment.id).is("assigned_to", null);
    } else if (reopened) {
      await msgDb.from("conversation_assignments").update({ status: "in_progress", updated_at: now }).eq("id", assignment.id);
    } else {
      await msgDb.from("conversation_assignments").update({ updated_at: now }).eq("id", assignment.id);
    }

    await msgDb.rpc("upsert_conversation_stats_external", {
      _organization_id: link.organization_id, _channel_id: link.channel_id, _conversation_phone: phone,
      _content: audio ? "[Áudio]" : text, _direction: "inbound", _is_read: false, _sender_name: lead?.name || "Visitante", _created_at: m.created_at,
    }).then(() => {}, () => {});

    await broadcast(sessionId, publicMessage(m));
    return json({ message: publicMessage(m) });
  } catch (e) {
    console.error("[webchat-send]", e);
    return json({ error: "Erro ao enviar" }, 500);
  }
});
