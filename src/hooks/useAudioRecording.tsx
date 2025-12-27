import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const opusRecorderLoadedRef = useRef<boolean>(false);
  const OpusMediaRecorderRef = useRef<any>(null);
  const workerOptionsRef = useRef<any>(null);

  // Preload opus-media-recorder on mount
  useEffect(() => {
    const loadOpusRecorder = async () => {
      try {
        // Load opus-media-recorder dynamically
        const OpusMediaRecorder = (await import('opus-media-recorder')).default;
        OpusMediaRecorderRef.current = OpusMediaRecorder;
        
        // Configure worker options using CDN paths
        workerOptionsRef.current = {
          encoderWorkerFactory: () => {
            return new Worker('https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/encoderWorker.umd.js');
          },
          OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OggOpusEncoder.wasm',
          WebMOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/WebMOpusEncoder.wasm'
        };
        
        opusRecorderLoadedRef.current = true;
        console.log('OpusMediaRecorder loaded successfully');
      } catch (error) {
        console.warn('Failed to load OpusMediaRecorder, will fall back to native:', error);
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
      
      let mediaRecorder: any;
      
      // Try to use OpusMediaRecorder for real OGG/OPUS format
      if (opusRecorderLoadedRef.current && OpusMediaRecorderRef.current && workerOptionsRef.current) {
        try {
          const OpusMediaRecorder = OpusMediaRecorderRef.current;
          const options = { mimeType: 'audio/ogg' };
          mediaRecorder = new OpusMediaRecorder(stream, options, workerOptionsRef.current);
          console.log('Using OpusMediaRecorder for real OGG/OPUS format');
        } catch (opusError) {
          console.warn('Failed to create OpusMediaRecorder, falling back to native:', opusError);
        }
      }
      
      // Fall back to native MediaRecorder if OpusMediaRecorder failed
      if (!mediaRecorder) {
        // Try different formats in order of preference
        const mimeTypes = [
          'audio/ogg;codecs=opus',
          'audio/webm;codecs=opus',
          'audio/mp4',
          'audio/webm'
        ];
        
        let selectedMime = 'audio/webm';
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            break;
          }
        }
        
        console.log('Using native MediaRecorder with format:', selectedMime);
        mediaRecorder = new MediaRecorder(stream, { 
          mimeType: selectedMime,
          audioBitsPerSecond: 128000
        });
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
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

        // Create blob with explicit OGG mime type
        const audioBlob = new Blob(chunks, { type: 'audio/ogg' });
        audioChunksRef.current = [];
        
        console.log('Recording completed:', {
          size: audioBlob.size,
          type: audioBlob.type,
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
