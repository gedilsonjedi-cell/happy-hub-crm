// Audio converter using FFmpeg.wasm single-threaded version
// Works without SharedArrayBuffer/COOP-COEP headers

let ffmpeg: any = null;
let loadPromise: Promise<any> | null = null;

// Load FFmpeg single-threaded version (no SharedArrayBuffer required)
export const loadFFmpeg = async (): Promise<any> => {
  if (ffmpeg) {
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
      
      // Use single-threaded version - doesn't require SharedArrayBuffer
      const baseURL = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/umd';
      
      console.log('[FFmpeg] Loading single-threaded version...');
      
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);
      
      await ffmpeg.load({ coreURL, wasmURL });
      
      console.log('[FFmpeg] Loaded successfully');
      return ffmpeg;
    } catch (error) {
      console.error('[FFmpeg] Failed to load:', error);
      loadPromise = null;
      throw error;
    }
  })();
  
  return loadPromise;
};

// Check if FFmpeg is loaded
export const isFFmpegLoaded = (): boolean => !!ffmpeg;

// Convert audio to OGG/Opus format
export const convertToOgg = async (audioBlob: Blob): Promise<Blob> => {
  console.log('[FFmpeg] Converting to OGG...', {
    inputSize: audioBlob.size,
    inputType: audioBlob.type
  });
  
  const { fetchFile } = await import('@ffmpeg/util');
  const ff = await loadFFmpeg();
  
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
    await ff.exec([
      '-i', inputFile,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      '-y',
      outputFile
    ]);
    
    const outputData = await ff.readFile(outputFile);
    
    // Cleanup
    await ff.deleteFile(inputFile);
    await ff.deleteFile(outputFile);
    
    const outputArray = new Uint8Array(outputData as ArrayBuffer);
    const outputBlob = new Blob([outputArray], { type: 'audio/ogg; codecs=opus' });
    
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
