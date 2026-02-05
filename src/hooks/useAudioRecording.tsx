 import { useState, useRef, useCallback, useMemo } from "react";

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

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
   const [needsConversion, setNeedsConversion] = useState(true); 
   const [recordingFormat, setRecordingFormat] = useState('ogg');
   const [isNativeOgg, setIsNativeOgg] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
         // Priority 2: Fallback to WebM (Chrome, Edge, etc.)
         // WebM with Opus codec - will need server-side conversion
         const fallbackMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
           ? 'audio/webm;codecs=opus' 
           : 'audio/webm';
         console.log('[AudioRecording] Using WebM recording (needs conversion):', fallbackMime);
         mediaRecorder = new MediaRecorder(stream, { 
           mimeType: fallbackMime,
           audioBitsPerSecond: 64000
         });
         setIsNativeOgg(false);
         setNeedsConversion(true);
         setRecordingFormat('webm');
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
