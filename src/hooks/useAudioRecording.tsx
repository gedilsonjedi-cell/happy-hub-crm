import { useState, useRef, useCallback, useMemo, useEffect } from "react";

// Polyfill for 'global' required by opus-media-recorder
if (typeof window !== 'undefined' && typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  needsConversion: boolean;
  recordingFormat: string;
  isNativeOgg: boolean;
}

// Check if native OGG recording is supported by the browser
const checkNativeOggSupport = (): boolean => {
  if (typeof MediaRecorder === 'undefined') return false;
  return MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') || 
         MediaRecorder.isTypeSupported('audio/ogg');
};

// Worker URLs for opus-media-recorder
const ENCODER_WORKER_URL = 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/encoderWorker.umd.js';
const OGG_OPUS_WASM_URL = 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/OggOpusEncoder.wasm';

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [needsConversion, setNeedsConversion] = useState(false); 
  const [recordingFormat, setRecordingFormat] = useState('ogg');
  const [isNativeOgg, setIsNativeOgg] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<any>(null); // Can be MediaRecorder or OpusMediaRecorder

  // Check if native OGG recording is supported
  const nativeOggSupported = useMemo(() => checkNativeOggSupport(), []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;
      
      let mediaRecorder: MediaRecorder;
      const targetMimeType = 'audio/ogg';
      
      // Priority 1: Native OGG/Opus recording (Firefox, some browsers)
      if (nativeOggSupported) {
        const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') 
          ? 'audio/ogg;codecs=opus' 
          : 'audio/ogg';
        console.log('[AudioRecording] Using native OGG recording:', mimeType);
        mediaRecorder = new MediaRecorder(stream, { 
          mimeType,
          audioBitsPerSecond: 64000
        });
        setIsNativeOgg(true);
        setNeedsConversion(false);
        setRecordingFormat('ogg');
      } else {
        // Priority 2: Use opus-media-recorder polyfill for OGG/Opus in Chrome/Edge
        console.log('[AudioRecording] Loading OpusMediaRecorder polyfill...');
        
        try {
          const OpusMediaRecorder = (await import('opus-media-recorder')).default;
          
          // Create worker options
          const workerOptions = {
            encoderWorkerFactory: () => new Worker(ENCODER_WORKER_URL),
            OggOpusEncoderWasmPath: OGG_OPUS_WASM_URL,
          };
          
          const opusRecorder = new OpusMediaRecorder(stream, { mimeType: targetMimeType }, workerOptions);
          recorderRef.current = opusRecorder;
          console.log('[AudioRecording] OpusMediaRecorder initialized successfully');
          setIsNativeOgg(false);
          setNeedsConversion(false); // No conversion needed - records directly in OGG
          setRecordingFormat('ogg');
          
          // Set up event handlers for OpusMediaRecorder
          opusRecorder.ondataavailable = (event: BlobEvent) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };
          
          opusRecorder.start(500);
          setIsRecording(true);
          setRecordingDuration(0);
          
          timerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
          }, 1000);
          
          return; // Early return - we've handled everything for OpusMediaRecorder
        } catch (polyfillError) {
          console.warn('[AudioRecording] OpusMediaRecorder failed, falling back to WebM:', polyfillError);
          // Final fallback: WebM (will need conversion)
          const fallbackMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/webm';
          mediaRecorder = new MediaRecorder(stream, { 
            mimeType: fallbackMime,
            audioBitsPerSecond: 64000
          });
          setIsNativeOgg(false);
          setNeedsConversion(true);
          setRecordingFormat('webm');
        }
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("[AudioRecording] Error starting recording:", error);
      throw new Error("Não foi possível acessar o microfone");
    }
  }, [nativeOggSupported]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setIsRecording(false);
        setRecordingDuration(0);

        const chunks = audioChunksRef.current;
        
        if (chunks.length === 0) {
          console.error('[AudioRecording] No audio chunks recorded');
          resolve(null);
          return;
        }

        // Determine actual MIME type from recorder
        const actualMimeType = recorder?.mimeType || 'audio/ogg';
        const audioBlob = new Blob(chunks, { type: actualMimeType });
        audioChunksRef.current = [];
        
        console.log('[AudioRecording] Recording completed:', {
          format: actualMimeType,
          size: audioBlob.size,
          chunks: chunks.length
        });

        resolve(audioBlob);
      };

      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    
    audioChunksRef.current = [];
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    needsConversion,
    recordingFormat,
    isNativeOgg
  };
};
