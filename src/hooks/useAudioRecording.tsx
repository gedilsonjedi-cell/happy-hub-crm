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

  // Centralized cleanup — ALWAYS releases mic, timer, chunks and resets UI state.
  // Called from every exit path (success, error, cancel) so a bad recording
  // NEVER leaves `isRecording` stuck true (which would hide the text composer).
  const hardReset = useCallback(() => {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch (e) { console.warn('[AudioRecording] stop threw during reset:', e); }
      }
    } catch {}
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const startRecording = useCallback(async () => {
    // Defensive: if a previous session left anything alive, tear it down first.
    hardReset();

    let stream: MediaStream | null = null;
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Seu navegador não suporta gravação de áudio. Use Chrome, Edge ou Safari atualizado.');
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder não disponível neste navegador.');
      }

      stream = await navigator.mediaDevices.getUserMedia({ 
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
      
      // Firefox can throw on some mimeType+bitrate combos. Retry with safer fallbacks.
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      } catch (e) {
        console.warn('[AudioRecording] Bitrate option failed, retrying without it:', e);
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e2) {
          console.warn('[AudioRecording] mimeType option failed, using browser default:', e2);
          mediaRecorder = new MediaRecorder(stream);
        }
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[AudioRecording] MediaRecorder error:', event);
        // Any runtime error mid-recording: fully release resources so the
        // composer is not permanently locked behind isRecording=true.
        hardReset();
      };
      
      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      // CRITICAL: release the mic stream if it was already acquired before the
      // MediaRecorder constructor (or any later step) threw. Without this, the
      // browser keeps the mic busy and every subsequent attempt fails with
      // NotReadableError ("Microfone em uso"), which surfaces to the user as
      // "Erro ao gravar áudio" — the exact symptom reported.
      hardReset();

      console.error("[AudioRecording] Error starting recording:", error);
      const err = error as DOMException;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        throw new Error('Permissão de microfone negada. Habilite nas configurações do navegador.');
      }
      if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        throw new Error('Nenhum microfone encontrado no dispositivo.');
      }
      if (err?.name === 'NotReadableError') {
        throw new Error('Microfone em uso por outro aplicativo.');
      }
      throw new Error(error instanceof Error ? error.message : 'Não foi possível acessar o microfone');
    }
  }, [getSupportedMimeType, hardReset]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      
      if (!recorder || recorder.state === 'inactive') {
        // Nothing valid to stop — guarantee a clean slate regardless.
        hardReset();
        resolve(null);
        return;
      }

      // Safety net: if onstop never fires (tab suspended, recorder wedged,
      // browser bug), unlock the UI after 5s so the composer is not held
      // hostage by a stuck isRecording=true.
      let settled = false;
      const settle = (value: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const watchdog = setTimeout(() => {
        console.error('[AudioRecording] onstop watchdog fired — forcing reset');
        hardReset();
        settle(null);
      }, 5000);

      recorder.onstop = () => {
        clearTimeout(watchdog);

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
          mediaRecorderRef.current = null;
          settle(null);
          return;
        }

        const actualMimeType = recorder?.mimeType || 'audio/ogg';
        const audioBlob = new Blob(chunks, { type: actualMimeType });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        
        console.log('[AudioRecording] Recording completed:', {
          format: actualMimeType,
          size: audioBlob.size,
          chunks: chunks.length,
          needsServerConversion: !actualMimeType.includes('ogg')
        });

        settle(audioBlob);
      };

      try {
        recorder.stop();
      } catch (e) {
        console.error('[AudioRecording] recorder.stop() threw:', e);
        clearTimeout(watchdog);
        hardReset();
        settle(null);
      }
    });
  }, [hardReset]);

  const cancelRecording = useCallback(() => {
    hardReset();
  }, [hardReset]);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  };
};
