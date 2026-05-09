// Returns a signed upload URL on the EXTERNAL Supabase project so the frontend
// can PUT files directly to external storage without going through the edge fn.
//
// Request: { fileName: string, contentType: string }
// Response: { signedUrl, token, path, publicUrl }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalSupabase, EXTERNAL_MEDIA_BUCKET } from '../_shared/externalStorage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Authenticate the caller against the LOCAL project (same auth)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const localSupa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await localSupa.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const fileName = (body?.fileName as string) || `${Date.now()}.bin`;
    // Sanitize the filename
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const ext = getExternalSupabase();
    const { data, error } = await ext.storage
      .from(EXTERNAL_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return new Response(JSON.stringify({ error: error?.message || 'sign failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pub } = ext.storage.from(EXTERNAL_MEDIA_BUCKET).getPublicUrl(path);

    return new Response(JSON.stringify({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl: pub.publicUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[external-storage-sign-upload] error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
