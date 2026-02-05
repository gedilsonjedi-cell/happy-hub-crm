// Edge Function para conversão de áudio WebM → MP3 via Cloudinary (gratuito)
// Recebe áudio em WebM, converte para MP3 (mais compatível com Meta API), salva no storage e retorna URL
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME');
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY');
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET');

// Função para gerar assinatura SHA-1 para Cloudinary
async function generateCloudinarySignature(paramsToSign: Record<string, string>): Promise<string> {
  const sortedKeys = Object.keys(paramsToSign).sort();
  const stringToSign = sortedKeys.map(k => `${k}=${paramsToSign[k]}`).join('&') + CLOUDINARY_API_SECRET;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Upload para Cloudinary e obter URL do arquivo convertido para MP3
async function uploadAndConvertWithCloudinary(audioBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Parâmetros para conversão: upload como video/raw e transformar para mp3
  const paramsToSign: Record<string, string> = {
    timestamp: timestamp,
    resource_type: 'video', // Cloudinary usa 'video' para áudio também
    format: 'mp3',
  };
  
  const signature = await generateCloudinarySignature(paramsToSign);
  
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), fileName);
  formData.append('timestamp', timestamp);
  formData.append('api_key', CLOUDINARY_API_KEY!);
  formData.append('signature', signature);
  formData.append('resource_type', 'video');
  formData.append('format', 'mp3');
  
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
  
  console.log('[convert-audio] Uploading to Cloudinary...');
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[convert-audio] Cloudinary upload error:', errorText);
    throw new Error(`Cloudinary upload failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  console.log('[convert-audio] Cloudinary upload successful:', result.secure_url);
  
  // Retorna a URL do arquivo já convertido para MP3
  return result.secure_url;
}

// Baixar arquivo convertido do Cloudinary
async function downloadFromCloudinary(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download from Cloudinary: ${response.status}`);
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
    
    const hasCloudinaryConfig = CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;

    // Se for WebM e temos Cloudinary configurado, converter para MP3
    if (isWebM && hasCloudinaryConfig) {
      console.log('[convert-audio] WebM detected, converting to MP3 via Cloudinary (free)...');
      
      try {
        const tempFileName = `audio_${Date.now()}.webm`;
        
        // 1. Upload para Cloudinary que converte automaticamente para MP3
        const cloudinaryUrl = await uploadAndConvertWithCloudinary(uint8Array.buffer as ArrayBuffer, tempFileName);
        
        // 2. Baixar o arquivo MP3 convertido
        finalAudioData = await downloadFromCloudinary(cloudinaryUrl);
        converted = true;
        
        console.log('[convert-audio] Conversion successful:', { 
          originalSize: uint8Array.length, 
          convertedSize: finalAudioData.byteLength 
        });
      } catch (convError) {
        console.error('[convert-audio] Cloudinary conversion failed:', convError);
        return new Response(
          JSON.stringify({ 
            error: 'Audio conversion failed', 
            details: convError instanceof Error ? convError.message : 'Unknown error'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (isWebM && !hasCloudinaryConfig) {
      console.error('[convert-audio] WebM detected but Cloudinary not configured');
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
