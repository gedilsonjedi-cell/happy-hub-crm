// One-shot bootstrap: ensures the `whatsapp-media` bucket exists on the EXTERNAL
// Supabase project with public read access. Safe to call repeatedly (idempotent).
import { getExternalSupabase, EXTERNAL_MEDIA_BUCKET } from '../_shared/externalStorage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supa = getExternalSupabase();

    // Check existing buckets
    const { data: buckets, error: listErr } = await supa.storage.listBuckets();
    if (listErr) throw listErr;

    const exists = buckets?.some((b) => b.name === EXTERNAL_MEDIA_BUCKET);
    let action = 'unchanged';

    if (!exists) {
      const { error: createErr } = await supa.storage.createBucket(EXTERNAL_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024, // 50MB
      });
      if (createErr) throw createErr;
      action = 'created';
    } else {
      // Ensure it stays public
      const { error: updErr } = await supa.storage.updateBucket(EXTERNAL_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
      });
      if (updErr) console.warn('[bootstrap] updateBucket warn:', updErr.message);
      action = 'updated';
    }

    return new Response(JSON.stringify({
      success: true,
      bucket: EXTERNAL_MEDIA_BUCKET,
      action,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[external-storage-bootstrap] error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
