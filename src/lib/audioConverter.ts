 let ffmpeg: any = null;
let isLoading = false;
let isLoaded = false;
 let loadPromise: Promise<any> | null = null;

 // Simple OGG header for Opus audio
 // This is a minimal remuxing approach - wraps raw Opus packets in OGG container
 const createOggOpusHeader = (sampleRate: number = 48000, channels: number = 1): Uint8Array => {
   // OpusHead packet
   const opusHead = new Uint8Array([
     0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
     0x01, // Version
     channels, // Channel count
     0x00, 0x00, // Pre-skip (little-endian)
     sampleRate & 0xff, (sampleRate >> 8) & 0xff, (sampleRate >> 16) & 0xff, (sampleRate >> 24) & 0xff, // Sample rate (little-endian)
     0x00, 0x00, // Output gain
     0x00, // Channel mapping family
   ]);
   return opusHead;
 };
 
 // Load FFmpeg only once with dynamic import to avoid React conflicts
 export const loadFFmpeg = async (): Promise<any> => {
  if (ffmpeg && isLoaded) {
    return ffmpeg;
  }

  // If already loading, wait for the same promise
  if (loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  
  loadPromise = (async () => {
    try {
       // Dynamic import to avoid bundling issues with React
       const { FFmpeg } = await import('@ffmpeg/ffmpeg');
       const { toBlobURL } = await import('@ffmpeg/util');
       
       ffmpeg = new FFmpeg();
    
       // Load FFmpeg core from CDN
       const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
       
       console.log('[FFmpeg] Loading from CDN...');
       
       const [coreURL, wasmURL] = await Promise.all([
         toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
         toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
       ]);
       
       await ffmpeg.load({ coreURL, wasmURL });
    
    isLoaded = true;
       console.log('[FFmpeg] Loaded successfully');
    return ffmpeg;
    } catch (error) {
      console.error('[FFmpeg] Failed to load:', error);
    isLoading = false;
      loadPromise = null;
    throw error;
    } finally {
    isLoading = false;
  }
  })();
  
  return loadPromise;
};

// Check if FFmpeg is loaded
export const isFFmpegLoaded = (): boolean => isLoaded;

// Convert any audio format to OGG with Opus codec (WhatsApp compatible)
export const convertToOgg = async (audioBlob: Blob): Promise<Blob> => {
  console.log('[FFmpeg] Starting audio conversion to OGG...', {
    inputSize: audioBlob.size,
    inputType: audioBlob.type
  });
  
   // Dynamic import fetchFile
   const { fetchFile } = await import('@ffmpeg/util');
   
  const ff = await loadFFmpeg();
  
  // Determine input format from blob type
  let inputExt = 'webm';
  if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
    inputExt = 'm4a';
  } else if (audioBlob.type.includes('ogg')) {
    inputExt = 'ogg';
  } else if (audioBlob.type.includes('wav')) {
    inputExt = 'wav';
  } else if (audioBlob.type.includes('mpeg') || audioBlob.type.includes('mp3')) {
    inputExt = 'mp3';
  }
  
  const inputFileName = `input.${inputExt}`;
  const outputFileName = 'output.ogg';
  
  try {
    // Write input file
    const inputData = await fetchFile(audioBlob);
    await ff.writeFile(inputFileName, inputData);
    
    console.log('[FFmpeg] Converting...', { inputExt, inputFileName });
    
    // Convert to OGG with Opus codec
    // -c:a libopus = use Opus codec
    // -b:a 64k = 64kbps bitrate (good quality for voice)
    // -ar 48000 = 48kHz sample rate (required for Opus)
    // -ac 1 = mono audio
    await ff.exec([
      '-i', inputFileName,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      '-y',
      outputFileName
    ]);
    
    // Read output file
    const outputData = await ff.readFile(outputFileName);
    
    // Clean up
    await ff.deleteFile(inputFileName);
    await ff.deleteFile(outputFileName);
    
    // Convert to proper Uint8Array and create blob
    const outputArray = typeof outputData === 'string' 
      ? new TextEncoder().encode(outputData)
      : new Uint8Array(outputData);
    const outputBlob = new Blob([outputArray], { type: 'audio/ogg; codecs=opus' });
    
    console.log('[FFmpeg] Conversion completed:', {
      inputSize: audioBlob.size,
      outputSize: outputBlob.size,
      outputType: outputBlob.type
    });
    
    return outputBlob;
  } catch (error) {
    console.error('[FFmpeg] Audio conversion failed:', error);
    throw error;
  }
};

// Convert any audio format to MP3 (fallback option)
export const convertToMp3 = async (audioBlob: Blob): Promise<Blob> => {
  console.log('[FFmpeg] Starting audio conversion to MP3...', {
    inputSize: audioBlob.size,
    inputType: audioBlob.type
  });
  
   // Dynamic import fetchFile
   const { fetchFile } = await import('@ffmpeg/util');
   
  const ff = await loadFFmpeg();
  
  // Determine input format from blob type
  let inputExt = 'webm';
  if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
    inputExt = 'm4a';
  } else if (audioBlob.type.includes('ogg')) {
    inputExt = 'ogg';
  } else if (audioBlob.type.includes('wav')) {
    inputExt = 'wav';
  }
  
  const inputFileName = `input.${inputExt}`;
  const outputFileName = 'output.mp3';
  
  try {
    // Write input file
    const inputData = await fetchFile(audioBlob);
    await ff.writeFile(inputFileName, inputData);
    
    console.log('[FFmpeg] Converting to MP3...', { inputExt, inputFileName });
    
    // Convert to MP3
    // -c:a libmp3lame = use MP3 codec
    // -b:a 128k = 128kbps bitrate
    // -ar 44100 = 44.1kHz sample rate
    // -ac 1 = mono audio
    await ff.exec([
      '-i', inputFileName,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '1',
      '-y',
      outputFileName
    ]);
    
    // Read output file
    const outputData = await ff.readFile(outputFileName);
    
    // Clean up
    await ff.deleteFile(inputFileName);
    await ff.deleteFile(outputFileName);
    
    // Convert to proper Uint8Array and create blob
    const outputArray = typeof outputData === 'string' 
      ? new TextEncoder().encode(outputData)
      : new Uint8Array(outputData);
    const outputBlob = new Blob([outputArray], { type: 'audio/mpeg' });
    
    console.log('[FFmpeg] Conversion to MP3 completed:', {
      inputSize: audioBlob.size,
      outputSize: outputBlob.size,
      outputType: outputBlob.type
    });
    
    return outputBlob;
  } catch (error) {
    console.error('[FFmpeg] Audio conversion to MP3 failed:', error);
    throw error;
  }
};

// Check if audio needs conversion (WebM is not supported by WhatsApp)
export const needsConversion = (mimeType: string): boolean => {
  // WhatsApp supported formats: ogg, mp3, mp4/m4a, aac
  const supportedFormats = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/aac'];
  return !supportedFormats.some(format => mimeType.includes(format.replace('audio/', '')));
};

// Preload FFmpeg (call on app startup to reduce first-use delay)
export const preloadFFmpeg = () => {
  loadFFmpeg().catch(err => {
    console.warn('[FFmpeg] Preload failed (will retry when needed):', err);
  });
 };
 
 // Alternative conversion using raw Blob manipulation
 // This creates a properly typed OGG blob from any audio blob
 export const repackageAsOgg = async (audioBlob: Blob): Promise<Blob> => {
   console.log('[AudioConverter] Repackaging audio as OGG...', {
     inputSize: audioBlob.size,
     inputType: audioBlob.type
   });
   
   // Simply re-create the blob with the correct MIME type
   // This works because most browsers encode Opus audio which is OGG-compatible
   const arrayBuffer = await audioBlob.arrayBuffer();
   const uint8Array = new Uint8Array(arrayBuffer);
   
   // Check if it's already an OGG file (starts with "OggS")
   if (uint8Array[0] === 0x4F && uint8Array[1] === 0x67 && uint8Array[2] === 0x67 && uint8Array[3] === 0x53) {
     console.log('[AudioConverter] File is already OGG format');
     return new Blob([arrayBuffer], { type: 'audio/ogg; codecs=opus' });
   }
   
   // For other formats, we need to throw and let caller handle fallback
   console.log('[AudioConverter] Cannot repackage non-OGG format, needs FFmpeg');
   throw new Error('Format requires FFmpeg conversion');
 };
 
 // Try multiple conversion strategies
 export const convertAudioSafe = async (audioBlob: Blob): Promise<Blob> => {
   console.log('[AudioConverter] Starting safe conversion...', {
     inputSize: audioBlob.size,
     inputType: audioBlob.type
   });
   
   // Strategy 1: Try repackaging (fast, works for OGG files)
   try {
     return await repackageAsOgg(audioBlob);
   } catch (e) {
     console.log('[AudioConverter] Repackaging failed, trying FFmpeg...');
   }
   
   // Strategy 2: Try FFmpeg (slower, but handles all formats)
   try {
     return await convertToOgg(audioBlob);
   } catch (e) {
     console.error('[AudioConverter] FFmpeg conversion failed:', e);
   }
   
   // Strategy 3: Return original with correct type (last resort)
   console.warn('[AudioConverter] All conversion methods failed, returning original');
   throw new Error('All conversion methods failed');
 };
