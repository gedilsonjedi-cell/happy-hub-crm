import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;

// Load FFmpeg only once
export const loadFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg && isLoaded) {
    return ffmpeg;
  }

  if (isLoading) {
    // Wait for loading to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpeg && isLoaded) {
      return ffmpeg;
    }
  }

  isLoading = true;
  
  try {
    ffmpeg = new FFmpeg();
    
    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    isLoaded = true;
    console.log('FFmpeg loaded successfully');
    return ffmpeg;
  } catch (error) {
    console.error('Failed to load FFmpeg:', error);
    isLoading = false;
    throw error;
  } finally {
    isLoading = false;
  }
};

// Convert any audio format to OGG with Opus codec
export const convertToOgg = async (audioBlob: Blob): Promise<Blob> => {
  console.log('Starting audio conversion to OGG...');
  
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
  const outputFileName = 'output.ogg';
  
  try {
    // Write input file
    const inputData = await fetchFile(audioBlob);
    await ff.writeFile(inputFileName, inputData);
    
    console.log('Converting audio...', { inputExt, inputFileName });
    
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
    
    console.log('Audio conversion completed:', {
      inputSize: audioBlob.size,
      outputSize: outputBlob.size,
      outputType: outputBlob.type
    });
    
    return outputBlob;
  } catch (error) {
    console.error('Audio conversion failed:', error);
    throw error;
  }
};

// Convert any audio format to MP3 (more widely supported)
export const convertToMp3 = async (audioBlob: Blob): Promise<Blob> => {
  console.log('Starting audio conversion to MP3...');
  
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
    
    console.log('Converting audio to MP3...', { inputExt, inputFileName });
    
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
    
    console.log('Audio conversion to MP3 completed:', {
      inputSize: audioBlob.size,
      outputSize: outputBlob.size,
      outputType: outputBlob.type
    });
    
    return outputBlob;
  } catch (error) {
    console.error('Audio conversion to MP3 failed:', error);
    throw error;
  }
};

// Preload FFmpeg (can be called on app startup)
export const preloadFFmpeg = () => {
  loadFFmpeg().catch(err => {
    console.warn('FFmpeg preload failed (will retry when needed):', err);
  });
};
