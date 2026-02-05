import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;
let loadPromise: Promise<FFmpeg> | null = null;

// Load FFmpeg only once
export const loadFFmpeg = async (): Promise<FFmpeg> => {
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
    ffmpeg = new FFmpeg();
    
      // Load FFmpeg core from CDN with timeout
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
