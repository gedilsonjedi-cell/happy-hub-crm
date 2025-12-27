import { useState, useRef, useCallback } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

// Get the best supported audio format for WhatsApp
// WhatsApp supports: AAC, AMR, MP3, M4A, OGG (with OPUS codec)
// Priority: OGG/OPUS > WebM/OPUS > MP3
const getBestMimeType = (): { mimeType: string; extension: string } => {
  // Prefer OGG with OPUS as it's natively supported by WhatsApp for voice messages
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
    return { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' };
  }
  // WebM with OPUS - most browsers support this
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus', extension: 'webm' };
  }
  // Plain WebM
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  // MP3 - widely supported
  if (MediaRecorder.isTypeSupported('audio/mpeg')) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  // Last resort: mp4/aac (Safari) - Note: May have compatibility issues with Meta API
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  }
  return { mimeType: 'audio/webm', extension: 'webm' };
};

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formatRef = useRef<{ mimeType: string; extension: string }>({ mimeType: 'audio/webm', extension: 'webm' });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 48000, // Higher sample rate for better quality
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;
      
      // Get the best format
      const format = getBestMimeType();
      formatRef.current = format;
      
      console.log('Recording with format:', format);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: format.mimeType,
        audioBitsPerSecond: 128000 // 128kbps for good quality
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Collect data more frequently for better responsiveness
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
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setIsRecording(false);
        setRecordingDuration(0);

        // Create blob from recorded chunks
        const chunks = audioChunksRef.current;
        const format = formatRef.current;
        
        if (chunks.length === 0) {
          console.error('No audio chunks recorded');
          resolve(null);
          return;
        }

        const audioBlob = new Blob(chunks, { type: format.mimeType });
        audioChunksRef.current = [];
        
        console.log('Recording completed:', {
          format: format.mimeType,
          extension: format.extension,
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
