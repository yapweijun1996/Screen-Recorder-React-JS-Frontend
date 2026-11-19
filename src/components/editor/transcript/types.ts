import type { useTranscription } from '../useTranscription';

export type TranscriptionState = ReturnType<typeof useTranscription>;
export type Translate = (key: string, params?: Record<string, string | number>) => string;
