import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Supported audio formats by WhatsApp
const WHATSAPP_SUPPORTED_FORMATS = [
  'audio/ogg',
  'audio/mpeg', 
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'audio/m4a',
  'audio/opus'
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
     const { audioUrl, organizationId, forceConvert, audioData, mimeType } = await req.json();

     if (!audioUrl && !audioData) {
      return new Response(
         JSON.stringify({ error: 'audioUrl or audioData is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

     console.log('Processing audio:', { audioUrl, organizationId, forceConvert, hasAudioData: !!audioData });

     // Initialize Supabase client first
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     );
 
     let uint8Array: Uint8Array;
     let originalMimeType: string;
 
     // Get audio data from URL or direct upload
     if (audioData) {
       // Base64 encoded audio data provided directly
       const binaryString = atob(audioData);
       uint8Array = new Uint8Array(binaryString.length);
       for (let i = 0; i < binaryString.length; i++) {
         uint8Array[i] = binaryString.charCodeAt(i);
       }
       originalMimeType = mimeType || 'audio/webm';
     } else {
       // Download the original audio from URL
       const audioResponse = await fetch(audioUrl);
       if (!audioResponse.ok) {
         throw new Error(`Failed to download audio: ${audioResponse.status}`);
       }
       const audioBlob = await audioResponse.blob();
       const arrayBuffer = await audioBlob.arrayBuffer();
       uint8Array = new Uint8Array(arrayBuffer);
       originalMimeType = audioBlob.type.toLowerCase();
    }

    console.log('Downloaded audio:', {
      size: uint8Array.length,
      originalMimeType
    });

    // Check if it's already a native OGG file (starts with "OggS")
    const isNativeOgg = uint8Array[0] === 0x4F && uint8Array[1] === 0x67 && 
                        uint8Array[2] === 0x67 && uint8Array[3] === 0x53;
    
    if (isNativeOgg && !forceConvert) {
      console.log('Audio is already native OGG format');
      
      // Upload directly
      const fileName = `audio_${Date.now()}.ogg`;
      const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, uint8Array, {
          contentType: 'audio/ogg',
          cacheControl: '3600'
        });
      
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(filePath);
        
        return new Response(
          JSON.stringify({ 
            success: true,
            convertedUrl: urlData.publicUrl,
            originalFormat: originalMimeType,
            converted: false,
            message: 'Formato OGG nativo'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Try CloudConvert API if available
    const cloudConvertApiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    
    if (cloudConvertApiKey) {
      console.log('Using CloudConvert API...');
      try {
        const tempFileName = `temp_${Date.now()}.${originalMimeType.includes('mp4') ? 'm4a' : 'webm'}`;
        const tempFilePath = organizationId ? `${organizationId}/${tempFileName}` : `temp/${tempFileName}`;
        
        await supabase.storage
          .from('whatsapp-media')
          .upload(tempFilePath, uint8Array, { contentType: originalMimeType, cacheControl: '60' });
        
        const { data: tempUrlData } = supabase.storage.from('whatsapp-media').getPublicUrl(tempFilePath);
        
        const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cloudConvertApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks: {
              'import-audio': { operation: 'import/url', url: tempUrlData.publicUrl },
              'convert-audio': { operation: 'convert', input: 'import-audio', output_format: 'ogg', audio_codec: 'libopus', audio_bitrate: 64 },
              'export-audio': { operation: 'export/url', input: 'convert-audio' }
            }
          })
        });
        
        if (createJobResponse.ok) {
          const job = await createJobResponse.json();
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
              headers: { 'Authorization': `Bearer ${cloudConvertApiKey}` }
            });
            const status = await statusResponse.json();
            if (status.data.status === 'finished') {
              const exportTask = status.data.tasks.find((t: { name: string }) => t.name === 'export-audio');
              if (exportTask?.result?.files?.[0]?.url) {
                const convertedResponse = await fetch(exportTask.result.files[0].url);
                const convertedBuffer = await convertedResponse.arrayBuffer();
                const fileName = `converted_${Date.now()}.ogg`;
                const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
                const { error: uploadError } = await supabase.storage
                  .from('whatsapp-media')
                  .upload(filePath, new Uint8Array(convertedBuffer), { contentType: 'audio/ogg', cacheControl: '3600' });
                await supabase.storage.from('whatsapp-media').remove([tempFilePath]);
                if (!uploadError) {
                  const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
                  return new Response(
                    JSON.stringify({ success: true, convertedUrl: urlData.publicUrl, originalFormat: originalMimeType, convertedFormat: 'audio/ogg', converted: true, method: 'cloudconvert' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
              break;
            } else if (status.data.status === 'error') { break; }
            attempts++;
          }
        }
        await supabase.storage.from('whatsapp-media').remove([tempFilePath]);
      } catch (e) { console.error('CloudConvert error:', e); }
    }
    
    // No conversion service - return error
    return new Response(
      JSON.stringify({ success: false, error: 'Conversão de áudio não disponível', details: 'Configure CLOUDCONVERT_API_KEY', originalFormat: originalMimeType }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing audio:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
