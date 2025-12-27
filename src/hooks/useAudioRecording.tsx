import { useState, useRef, useCallback } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

// Get the best supported audio format for recording
// Prioritize OGG/OPUS which is natively supported by WhatsApp
const getBestMimeType = (): string => {
  // OGG with OPUS - WhatsApp native format, best compatibility
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
    return 'audio/ogg;codecs=opus';
  }
  // Try WebM with OPUS - works on most browsers
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  // MP4/AAC - Safari (also supported by WhatsApp)
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  // Plain WebM
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  }
  return 'audio/webm';
};

// Get file extension based on mime type
const getExtensionFromMime = (mimeType: string): string => {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  return 'ogg';
};

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

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
      
      const mimeType = getBestMimeType();
      mimeTypeRef.current = mimeType;
      
      console.log('Recording with format:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Error starting recording:", error);
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
        const mimeType = mimeTypeRef.current;
        
        if (chunks.length === 0) {
          console.error('No audio chunks recorded');
          resolve(null);
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        audioChunksRef.current = [];
        
        console.log('Recording completed:', {
          format: mimeType,
          size: audioBlob.size,
          chunks: chunks.length
        });

        resolve(audioBlob);
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

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
    cancelRecording
  };
};
