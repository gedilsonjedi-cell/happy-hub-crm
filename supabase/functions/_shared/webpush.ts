import webpush from "npm:web-push@3.6.7";
import { localDb } from "./webchat.ts";

let cached: { publicKey: string; privateKey: string } | null = null;

/** Chaves VAPID: geradas uma vez pelo servidor e guardadas em tabela só do service_role. */
export async function getVapid() {
  if (cached) return cached;
  const { data } = await localDb.from("webpush_config").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (data) {
    cached = { publicKey: data.public_key, privateKey: data.private_key };
    return cached;
  }
  const k = webpush.generateVAPIDKeys();
  await localDb.from("webpush_config").insert({ id: 1, public_key: k.publicKey, private_key: k.privateKey });
  // Releitura resolve corrida entre duas gerações simultâneas
  const { data: row } = await localDb.from("webpush_config").select("public_key, private_key").eq("id", 1).single();
  cached = { publicKey: row!.public_key, privateKey: row!.private_key };
  return cached;
}

export async function sendPushToSession(sessionId: string, payload: Record<string, unknown>) {
  const { data: subs } = await localDb.from("webchat_push_subscriptions").select("endpoint, subscription").eq("session_id", sessionId);
  if (!subs?.length) return 0;
  const v = await getVapid();
  webpush.setVapidDetails("mailto:contato@optimuscrm.com.br", v.publicKey, v.privateKey);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription as any, JSON.stringify(payload), { TTL: 86400 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await localDb.from("webchat_push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else console.error("[webpush] send failed", e?.statusCode, e?.body || e?.message);
    }
  }));
  return sent;
}
