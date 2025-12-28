import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  supportedFormat: 'ogg' | 'mp3' | 'webm' | null;
}

// Check if we can record in a WhatsApp-supported format
const getSupportedMimeType = (): { mimeType: string; extension: string; supported: boolean } => {
  // Priority: OGG Opus > MP4/AAC > MP3 > WebM (not supported by WhatsApp)
  const formats = [
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', supported: true },
    { mimeType: 'audio/ogg', extension: 'ogg', supported: true },
    { mimeType: 'audio/mp4', extension: 'm4a', supported: true },
    { mimeType: 'audio/aac', extension: 'aac', supported: true },
    { mimeType: 'audio/mpeg', extension: 'mp3', supported: true },
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm', supported: false },
    { mimeType: 'audio/webm', extension: 'webm', supported: false },
  ];

  for (const format of formats) {
    if (MediaRecorder.isTypeSupported(format.mimeType)) {
      console.log('Best supported format:', format);
      return format;
    }
  }

  // Fallback
  return { mimeType: 'audio/webm', extension: 'webm', supported: false };
};

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [supportedFormat, setSupportedFormat] = useState<'ogg' | 'mp3' | 'webm' | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formatInfoRef = useRef<{ mimeType: string; extension: string; supported: boolean } | null>(null);

  // Check supported format on mount
  useEffect(() => {
    const format = getSupportedMimeType();
    formatInfoRef.current = format;
    
    if (format.extension === 'ogg') {
      setSupportedFormat('ogg');
    } else if (format.extension === 'mp3' || format.extension === 'm4a' || format.extension === 'aac') {
      setSupportedFormat('mp3');
    } else {
      setSupportedFormat('webm');
    }
    
    console.log('Audio recording format detected:', format);
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
      
      // Get the best supported format
      const format = formatInfoRef.current || getSupportedMimeType();
      
      console.log('Starting recording with format:', format.mimeType);
      
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
        
        if (chunks.length === 0) {
          console.error('No audio chunks recorded');
          resolve(null);
          return;
        }

        // Get format info
        const format = formatInfoRef.current || getSupportedMimeType();
        const mimeType = mediaRecorderRef.current?.mimeType || format.mimeType;
        const audioBlob = new Blob(chunks, { type: mimeType });
        audioChunksRef.current = [];
        
        console.log('Recording completed:', {
          format: mimeType,
          extension: format.extension,
          size: audioBlob.size,
          chunks: chunks.length,
          whatsappSupported: format.supported
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
    supportedFormat
  };
};
