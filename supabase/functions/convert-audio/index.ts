// Edge Function simplificada - apenas upload de áudio já convertido
// A conversão agora é feita no cliente via FFmpeg.wasm
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioData, mimeType, organizationId } = await req.json();

    if (!audioData) {
      return new Response(
        JSON.stringify({ error: 'audioData is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Uploading audio:', { mimeType, organizationId });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Decode base64 audio data
    const binaryString = atob(audioData);
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }

    // Detect format from magic bytes
    const isOgg = uint8Array[0] === 0x4F && uint8Array[1] === 0x67 && 
                  uint8Array[2] === 0x67 && uint8Array[3] === 0x53;
    
    // Use .opus extension for WhatsApp compatibility
    const contentType = isOgg ? 'audio/ogg' : (mimeType || 'audio/ogg');
    
    const fileName = `audio_${Date.now()}.opus`;
    const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, uint8Array, {
        contentType,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({
        success: true,
        convertedUrl: urlData.publicUrl,
        originalFormat: mimeType,
        isOgg
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error uploading audio:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
