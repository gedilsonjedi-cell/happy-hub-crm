 declare module 'opus-media-recorder' {
   interface OpusMediaRecorderOptions {
     mimeType?: string;
   }
 
   interface WorkerOptions {
     encoderWorkerFactory?: () => Worker;
     OggOpusEncoderWasmPath?: string;
     WebMOpusEncoderWasmPath?: string;
   }
 
   class OpusMediaRecorder extends EventTarget {
     constructor(
       stream: MediaStream,
       options?: OpusMediaRecorderOptions,
       workerOptions?: WorkerOptions
     );
 
     readonly state: 'inactive' | 'recording' | 'paused';
     readonly mimeType: string;
 
     start(timeslice?: number): void;
     stop(): void;
     pause(): void;
     resume(): void;
 
     ondataavailable: ((event: BlobEvent) => void) | null;
     onstop: ((event: Event) => void) | null;
     onstart: ((event: Event) => void) | null;
     onerror: ((event: ErrorEvent) => void) | null;
     onpause: ((event: Event) => void) | null;
     onresume: ((event: Event) => void) | null;
   }
 
   export default OpusMediaRecorder;
 }