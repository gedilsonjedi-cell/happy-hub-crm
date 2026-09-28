import { supabase } from "@/integrations/supabase/client";

export const CONTACT_AVATAR_BUCKET = "contact-avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SIGNED_TTL_SECONDS = 3600;
const BATCH_DELAY_MS = 40;

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
export function subscribeAvatars(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// ---------- URL assinada em lote ----------
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingPaths = new Set<string>();
let pathTimer: ReturnType<typeof setTimeout> | null = null;

export function getCachedSignedUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;
  return null;
}

export function requestSignedUrl(path: string) {
  if (getCachedSignedUrl(path) || pendingPaths.has(path)) return;
  pendingPaths.add(path);
  if (!pathTimer) pathTimer = setTimeout(flushPaths, BATCH_DELAY_MS);
}

async function flushPaths() {
  pathTimer = null;
  const paths = Array.from(pendingPaths);
  pendingPaths.clear();
  if (paths.length === 0) return;
  const { data, error } = await supabase.storage
    .from(CONTACT_AVATAR_BUCKET)
    .createSignedUrls(paths, SIGNED_TTL_SECONDS);
  if (error || !data) return;
  const expiresAt = Date.now() + SIGNED_TTL_SECONDS * 1000;
  data.forEach((item) => {
    if (item.signedUrl && item.path) urlCache.set(item.path, { url: item.signedUrl, expiresAt });
  });
  notify();
}

// ---------- Resolução por telefone (lista de conversas) ----------
export const phoneSuffix = (phone: string | null | undefined) =>
  (phone || "").replace(/\D/g, "").slice(-8);

const phoneCache = new Map<string, string | null>(); // `${org}:${suffix}` -> avatar_path
const pendingPhones = new Map<string, Set<string>>(); // org -> suffixes
let phoneTimer: ReturnType<typeof setTimeout> | null = null;

export function getPathForPhone(orgId: string | null | undefined, phone: string | null | undefined): string | null | undefined {
  const s = phoneSuffix(phone);
  if (!orgId || s.length < 8) return null;
  return phoneCache.get(`${orgId}:${s}`);
}

export function requestPhoneAvatar(orgId: string, phone: string) {
  const s = phoneSuffix(phone);
  if (s.length < 8 || phoneCache.has(`${orgId}:${s}`)) return;
  const set = pendingPhones.get(orgId) ?? new Set<string>();
  set.add(s);
  pendingPhones.set(orgId, set);
  if (!phoneTimer) phoneTimer = setTimeout(flushPhones, BATCH_DELAY_MS);
}

async function flushPhones() {
  phoneTimer = null;
  const batches = Array.from(pendingPhones.entries());
  pendingPhones.clear();
  for (const [orgId, set] of batches) {
    const suffixes = Array.from(set);
    for (let i = 0; i < suffixes.length; i += 100) {
      const chunk = suffixes.slice(i, i + 100);
      chunk.forEach((s) => phoneCache.set(`${orgId}:${s}`, null));
      const { data, error } = await supabase
        .from("leads")
        .select("phone, avatar_path, avatar_updated_at")
        .eq("organization_id", orgId)
        .not("avatar_path", "is", null)
        .or(chunk.map((s) => `phone.ilike.%${s}`).join(","));
      if (error || !data) continue;
      const newest = new Map<string, { path: string; at: string }>();
      data.forEach((row) => {
        const s = phoneSuffix(row.phone);
        if (!row.avatar_path || !chunk.includes(s)) return;
        const prev = newest.get(s);
        const at = row.avatar_updated_at || "";
        if (!prev || at > prev.at) newest.set(s, { path: row.avatar_path, at });
      });
      newest.forEach((v, s) => {
        phoneCache.set(`${orgId}:${s}`, v.path);
        requestSignedUrl(v.path);
      });
    }
  }
  notify();
}

/** Atualiza o cache local após salvar/remover (muda na hora para quem alterou). */
export function setLocalAvatar(orgId: string, phone: string | null | undefined, path: string | null, signedUrl?: string) {
  const s = phoneSuffix(phone);
  if (s.length >= 8) phoneCache.set(`${orgId}:${s}`, path);
  if (path && signedUrl) urlCache.set(path, { url: signedUrl, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  notify();
}

// ---------- Validação e conversão ----------
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) return "Formato não suportado. Use JPG, PNG ou WebP.";
  if (file.size > AVATAR_MAX_BYTES) return "Arquivo muito grande. O limite é 5 MB.";
  return null;
}

/** Recorte quadrado centralizado. */
export function centerSquareCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

export async function resizeToWebp(file: Blob, size = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, size: side } = centerSquareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("Não foi possível converter a imagem.");
  return blob;
}

// ---------- Upload / remoção ----------
export async function uploadLeadAvatar(params: {
  organizationId: string;
  leadId: string;
  blob: Blob;
  previousPath: string | null;
  userId: string | null;
}) {
  const path = `${params.organizationId}/${params.leadId}/${Date.now()}.webp`;
  const bucket = supabase.storage.from(CONTACT_AVATAR_BUCKET);
  const { error: upErr } = await bucket.upload(path, params.blob, { contentType: "image/webp", upsert: false });
  if (upErr) throw upErr;
  const { error: dbErr } = await supabase
    .from("leads")
    .update({ avatar_path: path, avatar_updated_at: new Date().toISOString(), avatar_updated_by: params.userId })
    .eq("id", params.leadId);
  if (dbErr) {
    await bucket.remove([path]);
    throw dbErr;
  }
  if (params.previousPath && params.previousPath !== path) await bucket.remove([params.previousPath]);
  const { data } = await bucket.createSignedUrl(path, SIGNED_TTL_SECONDS);
  return { path, signedUrl: data?.signedUrl };
}

export async function removeLeadAvatar(params: { leadId: string; previousPath: string | null; userId: string | null }) {
  const { error } = await supabase
    .from("leads")
    .update({ avatar_path: null, avatar_updated_at: new Date().toISOString(), avatar_updated_by: params.userId })
    .eq("id", params.leadId);
  if (error) throw error;
  if (params.previousPath) await supabase.storage.from(CONTACT_AVATAR_BUCKET).remove([params.previousPath]);
}
