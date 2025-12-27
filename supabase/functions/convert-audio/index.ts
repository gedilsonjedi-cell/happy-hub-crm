import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Use a cloud conversion API for reliable audio conversion
// We'll use CloudConvert or a similar service, but for now let's use a simpler approach:
// Re-encode using a public API or handle the format detection

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

    console.log('Processing audio from:', audioUrl);

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
      originalMimeType: audioBlob.type
    });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Since we can't convert in Deno without FFmpeg binary, 
    // we'll use a cloud service. For now, let's try using the Zamzar API
    // or return the original URL and let the frontend handle it differently
    
    // Alternative approach: Use AAC.js or similar pure JS decoder
    // But that's complex. Let's use a practical solution:
    
    // Option 1: Convert using a free API like audio.online-convert.com
    // Option 2: Use a worker service like CloudConvert
    // Option 3: Return error and ask user to record on mobile (which uses AAC/OGG)
    
    // For now, let's check if the format is already supported
    const mimeType = audioBlob.type.toLowerCase();
    const supportedFormats = ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/m4a'];
    
    const isSupported = supportedFormats.some(f => mimeType.includes(f.replace('audio/', '')));
    
    if (isSupported) {
      console.log('Audio format is already supported:', mimeType);
      return new Response(
        JSON.stringify({ 
          success: true,
          convertedUrl: audioUrl,
          originalFormat: mimeType,
          converted: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For WebM, we need conversion. Use Zamzar API if available
    const zamzarApiKey = Deno.env.get('ZAMZAR_API_KEY');
    
    if (zamzarApiKey) {
      console.log('Using Zamzar API for conversion...');
      
      // Start conversion job
      const formData = new FormData();
      formData.append('source_file', new Blob([uint8Array], { type: mimeType }), 'audio.webm');
      formData.append('target_format', 'mp3');
      
      const jobResponse = await fetch('https://api.zamzar.com/v1/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(zamzarApiKey + ':')}`
        },
        body: formData
      });
      
      if (!jobResponse.ok) {
        const error = await jobResponse.text();
        console.error('Zamzar job creation failed:', error);
        throw new Error('Conversion service error');
      }
      
      const job = await jobResponse.json();
      console.log('Zamzar job created:', job.id);
      
      // Poll for completion (max 30 seconds)
      let attempts = 0;
      let completedJob = null;
      
      while (attempts < 15) {
        await new Promise(r => setTimeout(r, 2000));
        
        const statusResponse = await fetch(`https://api.zamzar.com/v1/jobs/${job.id}`, {
          headers: {
            'Authorization': `Basic ${btoa(zamzarApiKey + ':')}`
          }
        });
        
        const status = await statusResponse.json();
        console.log('Job status:', status.status);
        
        if (status.status === 'successful') {
          completedJob = status;
          break;
        } else if (status.status === 'failed') {
          throw new Error('Conversion failed');
        }
        
        attempts++;
      }
      
      if (!completedJob || !completedJob.target_files?.[0]) {
        throw new Error('Conversion timeout');
      }
      
      // Download converted file
      const fileId = completedJob.target_files[0].id;
      const downloadResponse = await fetch(`https://api.zamzar.com/v1/files/${fileId}/content`, {
        headers: {
          'Authorization': `Basic ${btoa(zamzarApiKey + ':')}`
        }
      });
      
      if (!downloadResponse.ok) {
        throw new Error('Failed to download converted file');
      }
      
      const convertedBuffer = await downloadResponse.arrayBuffer();
      const convertedUint8 = new Uint8Array(convertedBuffer);
      
      // Upload to Supabase Storage
      const fileName = `converted_${Date.now()}.mp3`;
      const filePath = `${organizationId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, convertedUint8, {
          contentType: 'audio/mpeg',
          cacheControl: '3600'
        });
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Failed to upload converted audio');
      }
      
      const { data: urlData } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(filePath);
      
      console.log('Conversion complete, new URL:', urlData.publicUrl);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          convertedUrl: urlData.publicUrl,
          originalFormat: mimeType,
          converted: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // No conversion service available - return error with supported formats
    console.log('No conversion service available, format not supported:', mimeType);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Formato de áudio não suportado pelo WhatsApp',
        details: `O formato ${mimeType} não é suportado. Formatos aceitos: OGG, MP3, MP4, AAC, AMR.`,
        originalFormat: mimeType,
        supportedFormats: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr']
      }),
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
