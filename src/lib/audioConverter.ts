// Audio converter using FFmpeg.wasm
// Uses single-threaded version that works without SharedArrayBuffer

let ffmpeg: any = null;
let loadPromise: Promise<any> | null = null;
let isLoaded = false;

// Load FFmpeg single-threaded version (no SharedArrayBuffer required)
export const loadFFmpeg = async (): Promise<any> => {
  if (ffmpeg && isLoaded) {
    return ffmpeg;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');
      
      ffmpeg = new FFmpeg();
      
      // Use single-threaded version from official CDN
      // This doesn't require SharedArrayBuffer/COOP-COEP headers
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      console.log('[FFmpeg] Loading single-threaded version...');
      
      // Load core files as blob URLs to avoid CORS issues
      let coreURL: string;
      let wasmURL: string;
      
      try {
        [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        ]);
      } catch (urlError) {
        console.warn('[FFmpeg] toBlobURL failed, trying direct URLs:', urlError);
        // Fallback to direct URLs
        coreURL = `${baseURL}/ffmpeg-core.js`;
        wasmURL = `${baseURL}/ffmpeg-core.wasm`;
      }
      
      await ffmpeg.load({ 
        coreURL, 
        wasmURL,
        // Explicitly disable multi-threading
        workerURL: undefined
      });
      
      isLoaded = true;
      console.log('[FFmpeg] Loaded successfully');
      return ffmpeg;
    } catch (error) {
      console.error('[FFmpeg] Failed to load:', error);
      loadPromise = null;
      ffmpeg = null;
      isLoaded = false;
      throw error;
    }
  })();
  
  return loadPromise;
};

// Check if FFmpeg is loaded
export const isFFmpegLoaded = (): boolean => isLoaded;

// Convert audio to OGG/Opus format
export const convertToOgg = async (audioBlob: Blob): Promise<Blob> => {
  console.log('[FFmpeg] Converting to OGG...', {
    inputSize: audioBlob.size,
    inputType: audioBlob.type
  });
  
  // Ensure FFmpeg is loaded first
  const ff = await loadFFmpeg();
  
  if (!ff || !isLoaded) {
    throw new Error('FFmpeg failed to load');
  }
  
  const { fetchFile } = await import('@ffmpeg/util');
  
  // Determine input extension
  let inputExt = 'webm';
  if (audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a')) {
    inputExt = 'm4a';
  } else if (audioBlob.type.includes('ogg')) {
    inputExt = 'ogg';
  } else if (audioBlob.type.includes('wav')) {
    inputExt = 'wav';
  }
  
  const inputFile = `input.${inputExt}`;
  const outputFile = 'output.ogg';
  
  try {
    await ff.writeFile(inputFile, await fetchFile(audioBlob));
    
    console.log('[FFmpeg] Running conversion...');
    
    // Convert to OGG with Opus codec
    // Note: Using libvorbis as it's more widely available than libopus in browser builds
    await ff.exec([
      '-i', inputFile,
      '-c:a', 'libvorbis',
      '-q:a', '4',
      '-ac', '1',
      '-y',
      outputFile
    ]);
    
    const outputData = await ff.readFile(outputFile);
    
    // Cleanup
    await ff.deleteFile(inputFile);
    await ff.deleteFile(outputFile);
    
    const outputBlob = new Blob([outputData], { type: 'audio/ogg' });
    
    console.log('[FFmpeg] Conversion done:', {
      inputSize: audioBlob.size,
      outputSize: outputBlob.size
    });
    
    return outputBlob;
  } catch (error) {
    console.error('[FFmpeg] Conversion failed:', error);
    throw error;
  }
};

// Check if audio needs conversion
export const needsConversion = (mimeType: string): boolean => {
  const supported = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac'];
  return !supported.some(f => mimeType.includes(f.replace('audio/', '')));
};

// Preload FFmpeg
export const preloadFFmpeg = () => {
  loadFFmpeg().catch(err => {
    console.warn('[FFmpeg] Preload failed:', err);
  });
};
