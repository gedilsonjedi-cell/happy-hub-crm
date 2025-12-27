import { useState, useRef, useCallback } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

// Convert audio buffer to MP3 using lamejs
const convertToMp3 = async (audioBuffer: AudioBuffer): Promise<Blob> => {
  // @ts-ignore - lamejs doesn't have proper types
  const lamejs = await import('lamejs');
  
  const mp3Encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
  const samples = audioBuffer.getChannelData(0);
  
  // Convert float samples to 16-bit PCM
  const sampleBlockSize = 1152;
  const mp3Data: ArrayBuffer[] = [];
  
  const floatTo16BitPCM = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };
  
  const samples16 = floatTo16BitPCM(samples);
  
  for (let i = 0; i < samples16.length; i += sampleBlockSize) {
    const sampleChunk = samples16.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3Encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      // Convert Int8Array to ArrayBuffer
      const buffer = new ArrayBuffer(mp3buf.length);
      const view = new Uint8Array(buffer);
      for (let j = 0; j < mp3buf.length; j++) {
        view[j] = mp3buf[j];
      }
      mp3Data.push(buffer);
    }
  }
  
  const mp3buf = mp3Encoder.flush();
  if (mp3buf.length > 0) {
    const buffer = new ArrayBuffer(mp3buf.length);
    const view = new Uint8Array(buffer);
    for (let j = 0; j < mp3buf.length; j++) {
      view[j] = mp3buf[j];
    }
    mp3Data.push(buffer);
  }
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
};

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;
      
      // Use any supported format - we'll convert to MP3 later
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      console.log('Recording with mimeType:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(100);
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

      mediaRecorderRef.current.onstop = async () => {
        // Stop all tracks first
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

        try {
          // Create blob from recorded chunks
          const webmBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          
          console.log('Recorded webm blob size:', webmBlob.size);

          // Convert webm to MP3 for WhatsApp compatibility
          const audioContext = new AudioContext();
          const arrayBuffer = await webmBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          console.log('Decoded audio buffer:', audioBuffer.duration, 'seconds');
          
          const mp3Blob = await convertToMp3(audioBuffer);
          console.log('Converted to MP3, size:', mp3Blob.size);
          
          audioContext.close();
          resolve(mp3Blob);
          
        } catch (error) {
          console.error('Error converting audio:', error);
          // Fallback: return original webm if conversion fails
          const fallbackBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          resolve(fallbackBlob);
        }
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
