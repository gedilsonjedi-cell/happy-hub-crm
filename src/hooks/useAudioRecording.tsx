 import { useState, useRef, useCallback, useEffect, useMemo } from "react";

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

 // We'll use opus-media-recorder polyfill to always record in OGG/Opus
 // This eliminates the need for post-recording conversion

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
   const opusRecorderRef = useRef<any>(null);

   // Check if native OGG recording is supported
   const nativeOggSupported = useMemo(() => {
     if (typeof MediaRecorder === 'undefined') return false;
     return MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') || 
            MediaRecorder.isTypeSupported('audio/ogg');
   }, []);

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
       let usingPolyfill = false;
       
       // Priority 1: Try native OGG/Opus recording
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
         // Priority 2: Try opus-media-recorder polyfill
         try {
           const OpusMediaRecorder = (await import('opus-media-recorder')).default;
           const workerOptions = {
             OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/OggOpusEncoder.wasm',
             WebMOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/WebMOpusEncoder.wasm',
           };
           
           console.log('[AudioRecording] Using opus-media-recorder polyfill');
           mediaRecorder = new OpusMediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' }, workerOptions);
           opusRecorderRef.current = mediaRecorder;
           usingPolyfill = true;
           setIsNativeOgg(true); // Polyfill produces native OGG
           setNeedsConversion(false);
           setRecordingFormat('ogg');
         } catch (polyfillError) {
           console.warn('[AudioRecording] Polyfill failed, using native WebM:', polyfillError);
           // Priority 3: Fallback to WebM (will need conversion)
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
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
       mediaRecorder.start(500); // Slightly longer chunks for better compression
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("[AudioRecording] Error starting recording:", error);
      throw new Error("Não foi possível acessar o microfone");
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
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
         const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/ogg;codecs=opus';
         const audioBlob = new Blob(chunks, { type: actualMimeType });
        audioChunksRef.current = [];
        
        console.log('[AudioRecording] Recording completed:', {
           format: actualMimeType,
          size: audioBlob.size,
           chunks: chunks.length
        });

        resolve(audioBlob);
      };

      mediaRecorderRef.current.stop();
    });
   }, [nativeOggSupported]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    audioChunksRef.current = [];
     opusRecorderRef.current = null;
    
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
