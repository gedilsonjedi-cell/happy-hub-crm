// Migrates WhatsApp media from the LOCAL bucket to the EXTERNAL bucket.
// - Lists files in local `whatsapp-media`
// - Downloads each, uploads to external `whatsapp-media`
// - Updates `whatsapp_messages.media_url` rows that point to the old URL
// Idempotent: skips files already present on external.
//
// Body (optional): { batchSize?: number, prefix?: string, dryRun?: boolean, deleteAfter?: boolean }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalSupabase, EXTERNAL_MEDIA_BUCKET } from '../_shared/externalStorage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const localSupa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const LOCAL_PUBLIC_PREFIX = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/whatsapp-media/`;

interface Body {
  batchSize?: number;
  prefix?: string;
  dryRun?: boolean;
  deleteAfter?: boolean;
  cursor?: string; // last file path processed
}

async function listAllFiles(prefix: string, limit: number): Promise<{ name: string; full: string }[]> {
  // Recursively walk folders. Storage list returns folders with id=null.
  const out: { name: string; full: string }[] = [];
  const queue: string[] = [prefix];

  while (queue.length && out.length < limit) {
    const folder = queue.shift()!;
    let offset = 0;
    while (out.length < limit) {
      const { data, error } = await localSupa.storage
        .from('whatsapp-media')
        .list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) {
        console.error('[migrate] list error', folder, error.message);
        break;
      }
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = folder ? `${folder}/${item.name}` : item.name;
        if (item.id === null) {
          // folder
          queue.push(full);
        } else {
          out.push({ name: item.name, full });
          if (out.length >= limit) break;
        }
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return out;
}

async function fileExistsExternal(path: string): Promise<boolean> {
  const ext = getExternalSupabase();
  const lastSlash = path.lastIndexOf('/');
  const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : '';
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const { data } = await ext.storage.from(EXTERNAL_MEDIA_BUCKET).list(folder, {
    limit: 1, search: name,
  });
  return !!data?.some((d) => d.name === name);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body: Body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize ?? 200, 500);
    const prefix = body.prefix ?? '';
    const dryRun = !!body.dryRun;
    const deleteAfter = !!body.deleteAfter;

    const ext = getExternalSupabase();
    const files = await listAllFiles(prefix, batchSize);

    let migrated = 0, skipped = 0, failed = 0, urlsUpdated = 0;
    const errors: { path: string; error: string }[] = [];

    for (const f of files) {
      try {
        if (await fileExistsExternal(f.full)) {
          skipped++;
          continue;
        }
        if (dryRun) { migrated++; continue; }

        // Download from local
        const { data: blob, error: dlErr } = await localSupa.storage
          .from('whatsapp-media').download(f.full);
        if (dlErr || !blob) {
          failed++;
          errors.push({ path: f.full, error: dlErr?.message || 'download null' });
          continue;
        }
        const contentType = blob.type || 'application/octet-stream';
        const buffer = await blob.arrayBuffer();

        const { error: upErr } = await ext.storage
          .from(EXTERNAL_MEDIA_BUCKET)
          .upload(f.full, buffer, { contentType, upsert: false });
        if (upErr) {
          failed++;
          errors.push({ path: f.full, error: upErr.message });
          continue;
        }

        // Update message URLs in EXTERNAL DB (whatsapp_messages lives there)
        const oldUrl = `${LOCAL_PUBLIC_PREFIX}${f.full}`;
        const { data: newPub } = ext.storage.from(EXTERNAL_MEDIA_BUCKET).getPublicUrl(f.full);
        const { error: updErr, count } = await ext
          .from('whatsapp_messages')
          .update({ media_url: newPub.publicUrl }, { count: 'exact' })
          .eq('media_url', oldUrl);
        if (!updErr && count) urlsUpdated += count;

        if (deleteAfter) {
          await localSupa.storage.from('whatsapp-media').remove([f.full]).catch(() => {});
        }
        migrated++;
      } catch (err) {
        failed++;
        errors.push({ path: f.full, error: String((err as Error)?.message || err) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: files.length,
      migrated, skipped, failed, urlsUpdated,
      hasMore: files.length >= batchSize,
      errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[migrate-whatsapp-media] error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
