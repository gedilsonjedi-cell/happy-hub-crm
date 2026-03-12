import { useState, useRef, useCallback, useMemo, useEffect } from "react";

/**
 * Hook simplificado para gravação de áudio
 * 
 * Grava sempre em WebM (formato nativo do Chrome/Edge/Safari).
 * A conversão para OGG/Opus é feita no servidor via Edge Function.
 */
export const useAudioRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Determinar o melhor formato suportado pelo navegador
  const getSupportedMimeType = useCallback((): string => {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    
    // Prioridade: OGG nativo (Firefox) > WebM Opus > WebM padrão
    const formats = [
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/webm;codecs=opus',
      'audio/webm'
    ];
    
    for (const format of formats) {
      if (MediaRecorder.isTypeSupported(format)) {
        return format;
      }
    }
    
    return 'audio/webm';
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
      
      const mimeType = getSupportedMimeType();
      console.log('[AudioRecording] Using format:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 64000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(500); // Chunk a cada 500ms
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("[AudioRecording] Error starting recording:", error);
      throw new Error("Não foi possível acessar o microfone");
    }
  }, [getSupportedMimeType]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      
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

        const actualMimeType = recorder?.mimeType || 'audio/ogg';
        const audioBlob = new Blob(chunks, { type: actualMimeType });
        audioChunksRef.current = [];
        
        console.log('[AudioRecording] Recording completed:', {
          format: actualMimeType,
          size: audioBlob.size,
          chunks: chunks.length,
          needsServerConversion: !actualMimeType.includes('ogg')
        });

        resolve(audioBlob);
      };

      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    
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
    cancelRecording
  };
};
