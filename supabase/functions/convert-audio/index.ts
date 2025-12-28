import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { audioUrl, organizationId, forceConvert } = await req.json();

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'audioUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing audio:', { audioUrl, organizationId, forceConvert });

    // Download the original audio
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const originalMimeType = audioBlob.type.toLowerCase();
    console.log('Downloaded audio:', {
      size: uint8Array.length,
      originalMimeType
    });

    // Check if format is already supported
    const isSupported = WHATSAPP_SUPPORTED_FORMATS.some(f => 
      originalMimeType.includes(f.replace('audio/', '')) || 
      f.includes(originalMimeType.replace('audio/', ''))
    );

    // If already supported and not forcing conversion, return original URL
    if (isSupported && !forceConvert) {
      console.log('Audio format is already supported:', originalMimeType);
      return new Response(
        JSON.stringify({ 
          success: true,
          convertedUrl: audioUrl,
          originalFormat: originalMimeType,
          converted: false,
          message: 'Formato já suportado'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Try CloudConvert API first (if available)
    const cloudConvertApiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    
    if (cloudConvertApiKey) {
      console.log('Using CloudConvert API for conversion...');
      
      try {
        // Create job
        const createJobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cloudConvertApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tasks: {
              'import-audio': {
                operation: 'import/url',
                url: audioUrl
              },
              'convert-audio': {
                operation: 'convert',
                input: 'import-audio',
                output_format: 'ogg',
                audio_codec: 'libopus',
                audio_bitrate: 64
              },
              'export-audio': {
                operation: 'export/url',
                input: 'convert-audio'
              }
            }
          })
        });

        if (createJobResponse.ok) {
          const job = await createJobResponse.json();
          console.log('CloudConvert job created:', job.data.id);

          // Poll for completion
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            
            const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
              headers: { 'Authorization': `Bearer ${cloudConvertApiKey}` }
            });
            
            const status = await statusResponse.json();
            console.log('Job status:', status.data.status);
            
            if (status.data.status === 'finished') {
              // Find export task with result
              const exportTask = status.data.tasks.find((t: { name: string }) => t.name === 'export-audio');
              if (exportTask?.result?.files?.[0]?.url) {
                const convertedUrl = exportTask.result.files[0].url;
                
                // Download and upload to our storage
                const convertedResponse = await fetch(convertedUrl);
                const convertedBuffer = await convertedResponse.arrayBuffer();
                
                const fileName = `converted_${Date.now()}.ogg`;
                const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
                
                const { error: uploadError } = await supabase.storage
                  .from('whatsapp-media')
                  .upload(filePath, new Uint8Array(convertedBuffer), {
                    contentType: 'audio/ogg',
                    cacheControl: '3600'
                  });
                
                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('whatsapp-media')
                    .getPublicUrl(filePath);
                  
                  console.log('Conversion complete:', urlData.publicUrl);
                  
                  return new Response(
                    JSON.stringify({ 
                      success: true,
                      convertedUrl: urlData.publicUrl,
                      originalFormat: originalMimeType,
                      convertedFormat: 'audio/ogg',
                      converted: true
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
              break;
            } else if (status.data.status === 'error') {
              console.error('CloudConvert job failed');
              break;
            }
            
            attempts++;
          }
        }
      } catch (cloudConvertError) {
        console.error('CloudConvert error:', cloudConvertError);
      }
    }

    // Try Zamzar API as fallback (if available)
    const zamzarApiKey = Deno.env.get('ZAMZAR_API_KEY');
    
    if (zamzarApiKey) {
      console.log('Using Zamzar API for conversion...');
      
      try {
        const formData = new FormData();
        formData.append('source_file', new Blob([uint8Array], { type: originalMimeType }), 'audio.webm');
        formData.append('target_format', 'mp3');
        
        const jobResponse = await fetch('https://api.zamzar.com/v1/jobs', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(zamzarApiKey + ':')}`
          },
          body: formData
        });
        
        if (jobResponse.ok) {
          const job = await jobResponse.json();
          console.log('Zamzar job created:', job.id);
          
          // Poll for completion
          let attempts = 0;
          while (attempts < 15) {
            await new Promise(r => setTimeout(r, 2000));
            
            const statusResponse = await fetch(`https://api.zamzar.com/v1/jobs/${job.id}`, {
              headers: { 'Authorization': `Basic ${btoa(zamzarApiKey + ':')}` }
            });
            
            const status = await statusResponse.json();
            
            if (status.status === 'successful' && status.target_files?.[0]) {
              const fileId = status.target_files[0].id;
              const downloadResponse = await fetch(`https://api.zamzar.com/v1/files/${fileId}/content`, {
                headers: { 'Authorization': `Basic ${btoa(zamzarApiKey + ':')}` }
              });
              
              if (downloadResponse.ok) {
                const convertedBuffer = await downloadResponse.arrayBuffer();
                
                const fileName = `converted_${Date.now()}.mp3`;
                const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
                
                const { error: uploadError } = await supabase.storage
                  .from('whatsapp-media')
                  .upload(filePath, new Uint8Array(convertedBuffer), {
                    contentType: 'audio/mpeg',
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
                      convertedFormat: 'audio/mpeg',
                      converted: true
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
              break;
            } else if (status.status === 'failed') {
              break;
            }
            
            attempts++;
          }
        }
      } catch (zamzarError) {
        console.error('Zamzar error:', zamzarError);
      }
    }

    // No conversion service available or conversion failed
    // For WebM, we can't send to WhatsApp without conversion
    if (originalMimeType.includes('webm')) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Formato WebM não suportado pelo WhatsApp',
          details: 'Configure uma API de conversão (CLOUDCONVERT_API_KEY ou ZAMZAR_API_KEY) ou grave em um formato suportado (OGG, MP3).',
          originalFormat: originalMimeType,
          needsConversion: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return original URL for other formats (might work)
    return new Response(
      JSON.stringify({ 
        success: true,
        convertedUrl: audioUrl,
        originalFormat: originalMimeType,
        converted: false,
        warning: 'Formato pode não ser compatível com WhatsApp'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
