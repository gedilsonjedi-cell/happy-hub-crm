// Edge Function para conversão de áudio WebM → OGG/Opus via Zamzar API
// Recebe áudio em WebM, converte para MP3 (mais compatível com Meta API), salva no storage e retorna URL
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ZAMZAR_API_KEY = Deno.env.get('ZAMZAR_API_KEY');

// Função para fazer upload para Zamzar e iniciar conversão
async function uploadToZamzar(audioBuffer: ArrayBuffer, fileName: string, targetFormat: string = 'mp3'): Promise<number> {
  const formData = new FormData();
  formData.append('source_file', new Blob([audioBuffer], { type: 'audio/webm' }), fileName);
  formData.append('target_format', targetFormat);

  const response = await fetch('https://api.zamzar.com/v1/jobs', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(ZAMZAR_API_KEY + ':'),
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[convert-audio] Zamzar upload error:', errorText);
    throw new Error(`Zamzar upload failed: ${response.status} - ${errorText}`);
  }

  const job = await response.json();
  console.log('[convert-audio] Zamzar job created:', job.id);
  return job.id;
}

// Função para aguardar conversão e obter arquivo
async function waitForConversion(jobId: number, maxAttempts = 30): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://api.zamzar.com/v1/jobs/${jobId}`, {
      headers: {
        'Authorization': 'Basic ' + btoa(ZAMZAR_API_KEY + ':'),
      }
    });

    if (!response.ok) {
      throw new Error(`Zamzar status check failed: ${response.status}`);
    }

    const job = await response.json();
    console.log('[convert-audio] Job status:', job.status);

    if (job.status === 'successful' && job.target_files?.length > 0) {
      return job.target_files[0].id;
    }

    if (job.status === 'failed') {
      throw new Error('Zamzar conversion failed');
    }

    // Aguardar 1 segundo antes de verificar novamente
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Zamzar conversion timeout');
}

// Função para baixar arquivo convertido
async function downloadConvertedFile(fileId: number): Promise<ArrayBuffer> {
  const response = await fetch(`https://api.zamzar.com/v1/files/${fileId}/content`, {
    headers: {
      'Authorization': 'Basic ' + btoa(ZAMZAR_API_KEY + ':'),
    }
  });

  if (!response.ok) {
    throw new Error(`Zamzar download failed: ${response.status}`);
  }

  return await response.arrayBuffer();
}

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

    console.log('[convert-audio] Processing audio:', { mimeType, organizationId, dataLength: audioData.length });

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

    // Detectar formato pelos magic bytes
    const isOgg = uint8Array[0] === 0x4F && uint8Array[1] === 0x67 && 
                  uint8Array[2] === 0x67 && uint8Array[3] === 0x53;
    const isWebM = uint8Array[0] === 0x1A && uint8Array[1] === 0x45 && 
                   uint8Array[2] === 0xDF && uint8Array[3] === 0xA3;
    
    console.log('[convert-audio] Format detection:', { isOgg, isWebM, firstBytes: Array.from(uint8Array.slice(0, 4)) });
    
    let finalAudioData: ArrayBuffer = uint8Array.buffer as ArrayBuffer;
    let converted = false;
    let finalMimeType = 'audio/mpeg'; // MP3 mime type

    // Se for WebM e temos a chave Zamzar, converter para OGG
    if (isWebM && ZAMZAR_API_KEY) {
      console.log('[convert-audio] WebM detected, converting to MP3 via Zamzar...');
      
      try {
        const tempFileName = `audio_${Date.now()}.webm`;
        
        // 1. Upload para Zamzar e iniciar conversão para MP3
        // MP3 é mais compatível com a Meta API do que OGG
        const jobId = await uploadToZamzar(uint8Array.buffer as ArrayBuffer, tempFileName, 'mp3');
        
        // 2. Aguardar conversão
        const fileId = await waitForConversion(jobId);
        
        // 3. Baixar arquivo convertido
        finalAudioData = await downloadConvertedFile(fileId);
        converted = true;
        
        console.log('[convert-audio] Conversion successful:', { 
          originalSize: uint8Array.length, 
          convertedSize: finalAudioData.byteLength 
        });
      } catch (convError) {
        console.error('[convert-audio] Zamzar conversion failed:', convError);
        return new Response(
          JSON.stringify({ 
            error: 'Audio conversion failed', 
            details: convError instanceof Error ? convError.message : 'Unknown error'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (isWebM && !ZAMZAR_API_KEY) {
      console.error('[convert-audio] WebM detected but ZAMZAR_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Audio conversion service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Salvar no storage com extensão .mp3 (mais compatível com Meta API)
    const fileName = `audio_${Date.now()}.mp3`;
    const filePath = organizationId ? `${organizationId}/${fileName}` : `public/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, new Uint8Array(finalAudioData), {
        contentType: finalMimeType,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('[convert-audio] Storage upload error:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log('[convert-audio] Audio saved:', { url: urlData.publicUrl, converted, format: 'mp3' });

    return new Response(
      JSON.stringify({
        success: true,
        convertedUrl: urlData.publicUrl,
        originalFormat: mimeType,
        finalFormat: 'mp3',
        converted,
        mimeType: finalMimeType
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[convert-audio] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
