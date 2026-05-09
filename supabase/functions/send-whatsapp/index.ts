import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Extract Bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers });
    }
    const apiToken = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve channel by api_token
    const { data: channels, error: chErr } = await supabase.rpc('get_channel_by_api_token', { _token: apiToken });
    if (chErr || !channels || channels.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid API token or channel not connected' }), { status: 401, headers });
    }
    const channel = channels[0];

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    const body = await req.json();
    const { to, message, audioUrl, audioBase64 } = body;

    if (!to) {
      return new Response(JSON.stringify({ error: 'Field "to" (phone number) is required' }), { status: 400, headers });
    }

    if (!message && !audioUrl && !audioBase64) {
      return new Response(JSON.stringify({ error: 'Provide "message", "audioUrl", or "audioBase64"' }), { status: 400, headers });
    }

    // Determine provider and delegate to the correct send function
    const provider = channel.provider;

    if (provider === 'meta') {
      // Call meta-send internally via service role
      const invokeBody: Record<string, unknown> = {
        channelId: channel.id,
        destination: to.replace(/\D/g, ''),
      };

      if (audioUrl || audioBase64) {
        invokeBody.mediaType = 'audio';
        if (audioUrl) {
          invokeBody.mediaUrl = audioUrl;
        } else {
          invokeBody.audioBase64 = audioBase64;
        }
      } else {
        invokeBody.message = message;
      }

      // Call meta-send edge function directly
      const metaSendUrl = `${supabaseUrl}/functions/v1/meta-send`;
      const resp = await fetch(metaSendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(invokeBody),
      });

      const result = await resp.json();

      if (!resp.ok) {
        return new Response(JSON.stringify({ error: result.error || 'Failed to send message', details: result }), { status: resp.status, headers });
      }

      return new Response(JSON.stringify({ success: true, messageId: result.messageId, provider: 'meta' }), { status: 200, headers });

    } else if (provider === 'zapi') {
      const invokeBody: Record<string, unknown> = {
        channelId: channel.id,
        destination: to.replace(/\D/g, ''),
      };

      if (audioUrl || audioBase64) {
        invokeBody.mediaType = 'audio';
        if (audioUrl) invokeBody.mediaUrl = audioUrl;
        if (audioBase64) invokeBody.audioBase64 = audioBase64;
      } else {
        invokeBody.message = message;
      }

      const zapiSendUrl = `${supabaseUrl}/functions/v1/zapi-send`;
      const resp = await fetch(zapiSendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(invokeBody),
      });

      const result = await resp.json();

      if (!resp.ok) {
        return new Response(JSON.stringify({ error: result.error || 'Failed to send message', details: result }), { status: resp.status, headers });
      }

      return new Response(JSON.stringify({ success: true, messageId: result.messageId, provider: 'zapi' }), { status: 200, headers });

    } else if (provider === 'gupshup') {
      const invokeBody: Record<string, unknown> = {
        channelId: channel.id,
        destination: to.replace(/\D/g, ''),
        message: message,
      };

      const gupshupSendUrl = `${supabaseUrl}/functions/v1/gupshup-send`;
      const resp = await fetch(gupshupSendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(invokeBody),
      });

      const result = await resp.json();

      if (!resp.ok) {
        return new Response(JSON.stringify({ error: result.error || 'Failed to send message', details: result }), { status: resp.status, headers });
      }

      return new Response(JSON.stringify({ success: true, provider: 'gupshup' }), { status: 200, headers });

    } else {
      return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), { status: 400, headers });
    }

  } catch (err) {
    console.error('[send-whatsapp] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
});
