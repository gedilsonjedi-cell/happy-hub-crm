import { useState, useRef, useCallback } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

// Get the best supported audio format for recording
// We prioritize formats that WhatsApp/Meta accepts: OGG, MP4/AAC, MP3
const getBestMimeType = (): { mimeType: string; extension: string; storageMimeType: string } => {
  // Try OGG first - best for WhatsApp voice messages
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
    return { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', storageMimeType: 'audio/ogg' };
  }
  // MP4/AAC - Safari and some browsers
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'm4a', storageMimeType: 'audio/mp4' };
  }
  // WebM with OPUS - Chrome, Firefox
  // Note: We save this as .webm but Meta API accepts audio/webm for regular audio (not PTT)
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus', extension: 'webm', storageMimeType: 'audio/webm' };
  }
  // Plain WebM
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm', extension: 'webm', storageMimeType: 'audio/webm' };
  }
  // Fallback
  return { mimeType: 'audio/webm', extension: 'webm', storageMimeType: 'audio/webm' };
};

export const useAudioRecording = (): UseAudioRecordingReturn & { getFormat: () => { extension: string; storageMimeType: string } } => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formatRef = useRef<{ mimeType: string; extension: string; storageMimeType: string }>({ 
    mimeType: 'audio/webm', 
    extension: 'webm',
    storageMimeType: 'audio/webm'
  });

  const getFormat = useCallback(() => ({
    extension: formatRef.current.extension,
    storageMimeType: formatRef.current.storageMimeType
  }), []);

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
      
      // Get the best format
      const format = getBestMimeType();
      formatRef.current = format;
      
      console.log('Recording with format:', format);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: format.mimeType,
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
          storageMimeType: format.storageMimeType,
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
    cancelRecording,
    getFormat
  };
};
