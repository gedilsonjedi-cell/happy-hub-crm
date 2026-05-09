// Shared helper to access the EXTERNAL Supabase Storage with service role.
// Use this in edge functions to upload/manage WhatsApp media in the external project.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

let _client: SupabaseClient | null = null;

export const EXTERNAL_MEDIA_BUCKET = 'whatsapp-media';

export function getExternalSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('EXTERNAL_SUPABASE_URL');
  const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY missing');
  }
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/**
 * Upload bytes to the external whatsapp-media bucket and return the public URL.
 * Returns null on failure (callers should fall back gracefully).
 */
export async function uploadToExternalMedia(
  path: string,
  body: ArrayBuffer | Uint8Array | Blob,
  contentType: string,
  opts: { upsert?: boolean } = {},
): Promise<string | null> {
  try {
    const supa = getExternalSupabase();
    const { error } = await supa.storage
      .from(EXTERNAL_MEDIA_BUCKET)
      .upload(path, body, { contentType, upsert: opts.upsert ?? false });
    if (error) {
      console.error('[externalStorage] upload failed:', error.message);
      return null;
    }
    const { data } = supa.storage.from(EXTERNAL_MEDIA_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[externalStorage] upload exception:', err);
    return null;
  }
}
