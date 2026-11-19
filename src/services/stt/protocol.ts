export type Language = 'auto' | 'zh' | 'en';
export type ProgressStage = 'model' | 'audio' | 'transcribing';
export type TranscriptionError = 'no-audio' | 'model' | 'decode' | 'inference';

export interface Cue {
    id: string;
    start: number;
    end: number;
    text: string;
}

export interface WorkerRequest {
    type: 'transcribe';
    blob: Blob;
    language: Language;
}

export type WorkerResponse =
    | { type: 'progress'; stage: ProgressStage; progress: number }
    | { type: 'done'; cues: Cue[] }
    | { type: 'error'; code: TranscriptionError };
