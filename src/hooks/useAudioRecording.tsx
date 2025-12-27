import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

// OpusMediaRecorder worker options - loaded from CDN
const getOpusWorkerOptions = () => ({
  encoderWorkerFactory: function () {
    return new Worker(
      'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/encoderWorker.umd.js'
    );
  },
  OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/OggOpusEncoder.wasm',
  WebMOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@0.8.0/WebMOpusEncoder.wasm'
});

// Check if native OGG recording is supported
const supportsNativeOgg = (): boolean => {
  if (typeof MediaRecorder === 'undefined') return false;
  try {
    return MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
  } catch {
    return false;
  }
};

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const opusRecorderRef = useRef<typeof import('opus-media-recorder').default | null>(null);
  const useOpusPolyfillRef = useRef<boolean>(false);

  // Load OpusMediaRecorder if native OGG is not supported
  useEffect(() => {
    const loadOpusRecorder = async () => {
      if (!supportsNativeOgg()) {
        try {
          const OpusMediaRecorder = (await import('opus-media-recorder')).default;
          opusRecorderRef.current = OpusMediaRecorder;
          useOpusPolyfillRef.current = true;
          console.log('OpusMediaRecorder polyfill loaded for OGG support');
        } catch (error) {
          console.warn('Failed to load OpusMediaRecorder:', error);
        }
      } else {
        console.log('Native OGG recording supported');
      }
    };
    loadOpusRecorder();
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
      
      let recorder: MediaRecorder;
      
      if (useOpusPolyfillRef.current && opusRecorderRef.current) {
        // Use OpusMediaRecorder polyfill for OGG format
        const OpusMediaRecorder = opusRecorderRef.current;
        const workerOptions = getOpusWorkerOptions();
        
        console.log('Using OpusMediaRecorder for OGG recording');
        
        // @ts-ignore - OpusMediaRecorder has different constructor
        recorder = new OpusMediaRecorder(
          stream, 
          { mimeType: 'audio/ogg' },
          workerOptions
        );
      } else {
        // Use native MediaRecorder with OGG if supported
        const mimeType = supportsNativeOgg() 
          ? 'audio/ogg;codecs=opus' 
          : 'audio/webm;codecs=opus';
        
        console.log('Using native MediaRecorder with format:', mimeType);
        
        recorder = new MediaRecorder(stream, { 
          mimeType,
          audioBitsPerSecond: 128000
        });
      }
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.start(250);
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

        // Always use audio/ogg for the blob - either native or polyfilled
        const mimeType = 'audio/ogg';
        const audioBlob = new Blob(chunks, { type: mimeType });
        audioChunksRef.current = [];
        
        console.log('Recording completed:', {
          format: mimeType,
          extension: 'ogg',
          size: audioBlob.size,
          chunks: chunks.length,
          usedPolyfill: useOpusPolyfillRef.current
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
