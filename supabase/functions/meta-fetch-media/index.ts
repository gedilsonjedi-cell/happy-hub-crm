// Recovers a WhatsApp media that failed to download in the webhook.
// Looks up the message by id, fetches media via Meta API using the channel's
// access token, uploads to the EXTERNAL whatsapp-media bucket and updates message.media_url.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { uploadToExternalMedia } from '../_shared/externalStorage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messageId } = await req.json() as { messageId?: string };
    if (!messageId) {
      return new Response(JSON.stringify({ error: 'messageId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch message + channel
    const { data: msg, error: msgErr } = await supabase
      .from('whatsapp_messages')
      .select('id, channel_id, organization_id, media_url, metadata, message_type')
      .eq('id', messageId)
      .maybeSingle();

    if (msgErr || !msg) {
      return new Response(JSON.stringify({ error: 'message not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (msg.media_url) {
      return new Response(JSON.stringify({ success: true, media_url: msg.media_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meta = (msg.metadata || {}) as Record<string, unknown>;
    const mediaId = meta.media_id as string | undefined;
    const mimeType = (meta.media_mime_type as string) || 'application/octet-stream';
    if (!mediaId) {
      return new Response(JSON.stringify({ error: 'no media_id in metadata' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: channel } = await supabase
      .from('whatsapp_channels')
      .select('access_token')
      .eq('id', msg.channel_id)
      .maybeSingle();

    const accessToken = channel?.access_token as string | undefined;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'channel token not found' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get media URL
    const metaResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaResp.ok) {
      const t = await metaResp.text();
      return new Response(JSON.stringify({ error: `meta metadata: ${metaResp.status} ${t}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const metaData = await metaResp.json() as { url?: string };
    if (!metaData.url) {
      return new Response(JSON.stringify({ error: 'meta returned no url (media expired)' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Download
    const fileResp = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileResp.ok) {
      return new Response(JSON.stringify({ error: `download failed: ${fileResp.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const buffer = await fileResp.arrayBuffer();
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${msg.organization_id}/${Date.now()}_${mediaId}.${ext}`;

    const publicUrl = await uploadToExternalMedia(fileName, buffer, mimeType);
    if (!publicUrl) {
      return new Response(JSON.stringify({ error: 'external storage upload failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Persist (whatsapp_messages lives on the external DB, but local table mirrors it
    // and other code may still update via the local client; keep both safe by updating local only here)
    await supabase
      .from('whatsapp_messages')
      .update({ media_url: publicUrl })
      .eq('id', messageId);

    return new Response(JSON.stringify({ success: true, media_url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[meta-fetch-media] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
