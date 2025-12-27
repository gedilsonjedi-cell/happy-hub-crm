import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, organizationId } = await req.json();

    if (!audioUrl || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'audioUrl and organizationId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Converting audio from:', audioUrl);

    // Download the original audio
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    console.log('Downloaded audio:', {
      size: uint8Array.length,
      mimeType: audioBlob.type
    });

    // For now, we'll use FFmpeg via a cloud service or just re-upload with correct mime type
    // The issue is that M4A files won't play as voice messages in WhatsApp
    // We need to convert to OGG/OPUS format
    
    // Option 1: Use the audio as-is but send as regular audio (not PTT)
    // Option 2: Use a cloud conversion service
    
    // For now, let's just return the original URL and let the meta-send
    // handle it by sending as regular audio instead of PTT when format isn't OGG
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Determine if the format supports PTT (voice messages)
    const mimeType = audioBlob.type.toLowerCase();
    const supportsPtt = mimeType.includes('ogg') || mimeType.includes('opus');

    console.log('Audio format analysis:', {
      mimeType,
      supportsPtt
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        audioUrl,
        supportsPtt,
        mimeType,
        message: supportsPtt 
          ? 'Audio format supports voice messages' 
          : 'Audio format does not support voice messages, will send as regular audio'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error converting audio:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
