import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

 // WebM to OGG remuxer - extracts Opus packets from WebM and wraps in OGG container
 // This works because both containers use the same Opus codec
 async function remuxWebmToOgg(webmData: Uint8Array): Promise<Uint8Array> {
   // Simple approach: use FFmpeg via external service or manual remuxing
   // For now, we'll create a minimal valid OGG/Opus file structure
   
   // Check if this is actually WebM
   const isWebM = webmData[0] === 0x1A && webmData[1] === 0x45 && 
                  webmData[2] === 0xDF && webmData[3] === 0xA3;
   
   if (!isWebM) {
     throw new Error('Not a WebM file');
   }
   
   // For WebM/Opus files, we need proper remuxing
   // This is complex - WebM uses EBML format, OGG uses page-based format
   // Without a full parser, we cannot do this reliably
   throw new Error('WebM remuxing requires external conversion service');
 }
 
 // Create a minimal OGG/Opus file with proper headers
 // This can be used to wrap raw Opus data
 function createOggOpusHeaders(sampleRate: number = 48000, channels: number = 1): Uint8Array {
   // OGG page header + OpusHead + OggS page header + OpusTags
   const serialNo = Math.floor(Math.random() * 0xFFFFFFFF);
   
   // OpusHead packet
   const opusHead = new Uint8Array([
     0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
     0x01,                                           // Version
     channels,                                       // Channel count
     0x38, 0x01,                                     // Pre-skip (312 samples, little-endian)
     sampleRate & 0xFF, (sampleRate >> 8) & 0xFF,   // Sample rate (little-endian)
     (sampleRate >> 16) & 0xFF, (sampleRate >> 24) & 0xFF,
     0x00, 0x00,                                     // Output gain
     0x00,                                           // Channel mapping family
   ]);
   
   // OpusTags packet (minimal)
   const vendor = "Lovable";
   const opusTags = new Uint8Array(8 + 4 + vendor.length + 4);
   const tagsView = new DataView(opusTags.buffer);
   opusTags.set([0x4F, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // "OpusTags"
   tagsView.setUint32(8, vendor.length, true);
   for (let i = 0; i < vendor.length; i++) {
     opusTags[12 + i] = vendor.charCodeAt(i);
   }
   tagsView.setUint32(12 + vendor.length, 0, true); // No user comments
   
   return opusHead; // For now, just return this - full implementation would need page wrapping
 }
 
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

     // Initialize Supabase client
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

     // Check magic bytes for file format detection
     const isOggFile = uint8Array[0] === 0x4F && uint8Array[1] === 0x67 && 
                       uint8Array[2] === 0x67 && uint8Array[3] === 0x53; // "OggS"
    
     // Check for WebM (starts with EBML header 0x1A45DFA3)
     const isWebM = uint8Array[0] === 0x1A && uint8Array[1] === 0x45 && 
                    uint8Array[2] === 0xDF && uint8Array[3] === 0xA3;
     
     if (isOggFile && !forceConvert) {
       console.log('Audio is already in OGG format');
      
       // Upload directly with correct content type
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
             message: 'Already OGG format'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

     // Try Zamzar API if configured (free tier: 100 conversions/month)
     const zamzarApiKey = Deno.env.get('ZAMZAR_API_KEY');
     
     if (zamzarApiKey && isWebM) {
       console.log('Using Zamzar API for conversion...');
       try {
         // Upload file to Zamzar
         const formData = new FormData();
         const audioArrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength) as ArrayBuffer;
         formData.append('source_file', new Blob([audioArrayBuffer], { type: originalMimeType }), 'audio.webm');
         formData.append('target_format', 'ogg');
         
         const uploadResponse = await fetch('https://api.zamzar.com/v1/jobs', {
           method: 'POST',
           headers: {
             'Authorization': 'Basic ' + btoa(zamzarApiKey + ':'),
           },
           body: formData
         });
         
         if (uploadResponse.ok) {
           const job = await uploadResponse.json();
           console.log('Zamzar job created:', job.id);
           
           // Poll for completion (max 60 seconds)
           for (let attempts = 0; attempts < 30; attempts++) {
             await new Promise(r => setTimeout(r, 2000));
             
             const statusResponse = await fetch(`https://api.zamzar.com/v1/jobs/${job.id}`, {
               headers: { 'Authorization': 'Basic ' + btoa(zamzarApiKey + ':') }
             });
             
             const status = await statusResponse.json();
             
             if (status.status === 'successful' && status.target_files?.length > 0) {
               // Download converted file
               const fileId = status.target_files[0].id;
               const downloadResponse = await fetch(`https://api.zamzar.com/v1/files/${fileId}/content`, {
                 headers: { 'Authorization': 'Basic ' + btoa(zamzarApiKey + ':') }
               });
               
               const convertedBuffer = await downloadResponse.arrayBuffer();
               
               // Upload to storage
               const fileName = `converted_${Date.now()}.ogg`;
               const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
               
               const { error: uploadError } = await supabase.storage
                 .from('whatsapp-media')
                 .upload(filePath, new Uint8Array(convertedBuffer), {
                   contentType: 'audio/ogg',
                   cacheControl: '3600'
                 });
               
               if (!uploadError) {
                 const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
                 
                 // Delete file from Zamzar to save space
                 await fetch(`https://api.zamzar.com/v1/files/${fileId}`, {
                   method: 'DELETE',
                   headers: { 'Authorization': 'Basic ' + btoa(zamzarApiKey + ':') }
                 });
                 
                 return new Response(
                   JSON.stringify({
                     success: true,
                     convertedUrl: urlData.publicUrl,
                     originalFormat: originalMimeType,
                     convertedFormat: 'audio/ogg',
                     converted: true,
                     method: 'zamzar'
                   }),
                   { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                 );
               }
               break;
             } else if (status.status === 'failed') {
               console.error('Zamzar conversion failed:', status);
               break;
             }
           }
         }
       } catch (e) {
         console.error('Zamzar error:', e);
       }
     }
 
     // Try CloudConvert API if configured
    const cloudConvertApiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    
    if (cloudConvertApiKey) {
      console.log('Using CloudConvert API...');
      try {
         // Determine input extension
         let inputExt = 'webm';
         if (originalMimeType.includes('mp4') || originalMimeType.includes('m4a')) inputExt = 'm4a';
         else if (originalMimeType.includes('wav')) inputExt = 'wav';
         else if (originalMimeType.includes('mp3') || originalMimeType.includes('mpeg')) inputExt = 'mp3';
         
         const tempFileName = `temp_${Date.now()}.${inputExt}`;
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
               'convert-audio': { 
                 operation: 'convert', 
                 input: 'import-audio', 
                 output_format: 'ogg', 
                 audio_codec: 'libopus', 
                 audio_bitrate: 64,
                 audio_channels: 1,
                 audio_frequency: 48000
               },
              'export-audio': { operation: 'export/url', input: 'convert-audio' }
            }
          })
        });
        
        if (createJobResponse.ok) {
          const job = await createJobResponse.json();
           // Poll for completion (max 60 seconds)
           for (let attempts = 0; attempts < 30; attempts++) {
             await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
             
            const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
              headers: { 'Authorization': `Bearer ${cloudConvertApiKey}` }
            });
            const status = await statusResponse.json();
             
            if (status.data.status === 'finished') {
              const exportTask = status.data.tasks.find((t: { name: string }) => t.name === 'export-audio');
              if (exportTask?.result?.files?.[0]?.url) {
                 // Download converted file
                const convertedResponse = await fetch(exportTask.result.files[0].url);
                const convertedBuffer = await convertedResponse.arrayBuffer();
                 
                 // Upload to storage
                const fileName = `converted_${Date.now()}.ogg`;
                const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
                const { error: uploadError } = await supabase.storage
                  .from('whatsapp-media')
                  .upload(filePath, new Uint8Array(convertedBuffer), { contentType: 'audio/ogg', cacheControl: '3600' });
                 
                 // Clean up temp file
                await supabase.storage.from('whatsapp-media').remove([tempFilePath]);
                 
                if (!uploadError) {
                  const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
                  return new Response(
                     JSON.stringify({ 
                       success: true, 
                       convertedUrl: urlData.publicUrl, 
                       originalFormat: originalMimeType, 
                       convertedFormat: 'audio/ogg', 
                       converted: true, 
                       method: 'cloudconvert' 
                     }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
              break;
             } else if (status.data.status === 'error') { 
               console.error('CloudConvert job failed:', status.data);
               break; 
             }
          }
        }
         // Clean up temp file on failure
        await supabase.storage.from('whatsapp-media').remove([tempFilePath]);
       } catch (e) { 
         console.error('CloudConvert error:', e); 
       }
    }
    
     // No conversion available - upload as-is with warning
     // Some formats may still work with WhatsApp
     console.log('No conversion service available, uploading original');
     
      // For WebM, we still upload but warn that it likely won't work
      const extension = isWebM ? 'webm' : (isOggFile ? 'ogg' : 'audio');
      const fileName = `audio_${Date.now()}.${extension}`;
     const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
     
     const { error: uploadError } = await supabase.storage
       .from('whatsapp-media')
       .upload(filePath, uint8Array, { 
         contentType: originalMimeType, 
         cacheControl: '3600' 
       });
     
     if (!uploadError) {
       const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
       
       return new Response(
         JSON.stringify({ 
            success: !isWebM, // Only success if not WebM (since WebM won't work with WhatsApp)
           convertedUrl: urlData.publicUrl,
           originalFormat: originalMimeType,
           converted: false,
            error: isWebM ? 'Formato WebM não suportado pelo WhatsApp. Configure CLOUDCONVERT_API_KEY ou ZAMZAR_API_KEY para conversão automática.' : undefined,
            warning: isWebM ? undefined : 'No conversion performed - format may not be compatible with WhatsApp'
         }),
          { status: isWebM ? 400 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
     
    return new Response(
       JSON.stringify({ 
         success: false, 
         error: 'Failed to process audio',
         originalFormat: originalMimeType 
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
