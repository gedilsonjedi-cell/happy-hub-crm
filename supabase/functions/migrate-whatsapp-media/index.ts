// Migrates WhatsApp media from the LOCAL bucket to the EXTERNAL bucket.
// Self-chaining background mode: a single POST {action:'start'} kicks off the
// whole migration. Each tick processes one folder's worth of files, then
// re-invokes itself in the background and returns 200 immediately.
//
// Actions:
//   POST { action: 'start', deleteAfter?: boolean }      → starts migration
//   POST { action: 'tick', progressId, deleteAfter, cursor? } → internal
//   POST { action: 'status' }                             → returns latest run
//   POST { action: 'stop' }                               → marks running runs as 'cancelled'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalSupabase, EXTERNAL_MEDIA_BUCKET } from '../_shared/externalStorage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const localSupa = createClient(SUPABASE_URL, SERVICE_KEY);
const LOCAL_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/`;
const SELF_URL = `${SUPABASE_URL}/functions/v1/migrate-whatsapp-media`;

interface ListItem { name: string; id: string | null }

async function listFolder(folder: string, offset: number, limit: number): Promise<ListItem[]> {
  const { data, error } = await localSupa.storage
    .from('whatsapp-media')
    .list(folder, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
  if (error) {
    console.error('[migrate] list error', folder, error.message);
    return [];
  }
  return (data || []) as ListItem[];
}

// Lists files in external folder (one page) → set of names already there
async function listExternalNames(folder: string): Promise<Set<string>> {
  const ext = getExternalSupabase();
  const out = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await ext.storage
      .from(EXTERNAL_MEDIA_BUCKET)
      .list(folder, { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const d of data) if (d.id !== null) out.add(d.name);
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function updateProgress(id: string, patch: Record<string, unknown>) {
  await localSupa.from('media_migration_progress')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
}

async function incProgress(id: string, deltas: { migrated?: number; skipped?: number; failed?: number; urls_updated?: number; last_folder?: string }) {
  const { data } = await localSupa.from('media_migration_progress').select('*').eq('id', id).single();
  if (!data) return;
  await updateProgress(id, {
    migrated: Number(data.migrated || 0) + (deltas.migrated || 0),
    skipped: Number(data.skipped || 0) + (deltas.skipped || 0),
    failed: Number(data.failed || 0) + (deltas.failed || 0),
    urls_updated: Number(data.urls_updated || 0) + (deltas.urls_updated || 0),
    ...(deltas.last_folder !== undefined ? { last_folder: deltas.last_folder } : {}),
  });
}

async function processFolder(folder: string, deleteAfter: boolean, progressId: string): Promise<{ migrated: number; skipped: number; failed: number; urlsUpdated: number; subfolders: string[] }> {
  const ext = getExternalSupabase();
  const externalNames = await listExternalNames(folder);

  let migrated = 0, skipped = 0, failed = 0, urlsUpdated = 0;
  const subfolders: string[] = [];

  let offset = 0;
  while (true) {
    const items = await listFolder(folder, offset, 100);
    if (items.length === 0) break;

    for (const item of items) {
      const full = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) {
        subfolders.push(full);
        continue;
      }
      if (externalNames.has(item.name)) { skipped++; continue; }

      try {
        const { data: blob, error: dlErr } = await localSupa.storage
          .from('whatsapp-media').download(full);
        if (dlErr || !blob) { failed++; continue; }
        const contentType = blob.type || 'application/octet-stream';
        const buffer = await blob.arrayBuffer();

        const { error: upErr } = await ext.storage
          .from(EXTERNAL_MEDIA_BUCKET)
          .upload(full, buffer, { contentType, upsert: false });
        if (upErr) { failed++; continue; }

        const oldUrl = `${LOCAL_PUBLIC_PREFIX}${full}`;
        const { data: pub } = ext.storage.from(EXTERNAL_MEDIA_BUCKET).getPublicUrl(full);
        const { count } = await ext.from('whatsapp_messages')
          .update({ media_url: pub.publicUrl }, { count: 'exact' })
          .eq('media_url', oldUrl);
        if (count) urlsUpdated += count;

        if (deleteAfter) {
          await localSupa.storage.from('whatsapp-media').remove([full]).catch(() => {});
        }
        migrated++;
      } catch (err) {
        console.error('[migrate] file error', full, err);
        failed++;
      }
    }

    // periodic flush
    await incProgress(progressId, { migrated, skipped, failed, urls_updated: urlsUpdated, last_folder: folder });
    migrated = 0; skipped = 0; failed = 0; urlsUpdated = 0;

    if (items.length < 100) break;
    offset += items.length;
  }
  return { migrated, skipped, failed, urlsUpdated, subfolders };
}

async function selfInvoke(payload: Record<string, unknown>) {
  // Fire-and-forget; we don't await to keep response fast
  fetch(SELF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(payload),
  }).catch((e) => console.error('[migrate] self-invoke failed', e));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'status';

    if (action === 'status') {
      const { data } = await localSupa.from('media_migration_progress')
        .select('*').order('started_at', { ascending: false }).limit(1).maybeSingle();
      return new Response(JSON.stringify({ progress: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'stop') {
      await localSupa.from('media_migration_progress')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('status', 'running');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'start') {
      const deleteAfter = !!body.deleteAfter;
      // Cancel any previous running runs to avoid double-processing
      await localSupa.from('media_migration_progress')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('status', 'running');

      const { data: row, error } = await localSupa.from('media_migration_progress')
        .insert({ status: 'running', delete_after: deleteAfter })
        .select('*').single();
      if (error || !row) throw new Error(error?.message || 'failed to create progress row');

      // Kick off background tick on root folder
      selfInvoke({ action: 'tick', progressId: row.id, deleteAfter, folders: [''] });

      return new Response(JSON.stringify({ started: true, progressId: row.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'tick') {
      const progressId = body.progressId as string;
      const deleteAfter = !!body.deleteAfter;
      const folders = (body.folders as string[]) || [''];

      // Bail if cancelled
      const { data: prog } = await localSupa.from('media_migration_progress')
        .select('status').eq('id', progressId).single();
      if (!prog || prog.status !== 'running') {
        return new Response(JSON.stringify({ ok: false, reason: 'not running' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const folder = folders.shift()!;
      const work = (async () => {
        try {
          const { subfolders } = await processFolder(folder, deleteAfter, progressId);
          const next = [...folders, ...subfolders];
          if (next.length > 0) {
            selfInvoke({ action: 'tick', progressId, deleteAfter, folders: next });
          } else {
            await updateProgress(progressId, {
              status: 'completed',
              finished_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error('[migrate] tick error', err);
          await updateProgress(progressId, {
            status: 'failed',
            last_error: String((err as Error)?.message || err),
            finished_at: new Date().toISOString(),
          });
        }
      })();

      // Run in background so we return immediately
      // @ts-ignore EdgeRuntime exists in deno deploy
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(work);
      } else {
        // Fallback: run async without awaiting
        work.catch(() => {});
      }

      return new Response(JSON.stringify({ ok: true, processing: folder }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[migrate-whatsapp-media] error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
