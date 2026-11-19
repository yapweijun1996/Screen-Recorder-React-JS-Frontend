import type { AutomaticSpeechRecognitionOutput } from '@huggingface/transformers';
import { readAudioWindows, NoAudioTrackError, type AudioWindow } from './audioWindows';
import { prepareTranscriber } from './modelCache';
import type { Cue, Language, ProgressStage, WorkerRequest, WorkerResponse } from './protocol';

type Transcriber = (
    audio: Float32Array,
    options: { return_timestamps: true; task: 'transcribe'; language?: string },
) => Promise<AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[]>;

interface ModelChunk {
    timestamp?: [number | null, number | null];
    text?: string;
}

const LANGUAGE_NAMES: Record<Exclude<Language, 'auto'>, string> = {
    zh: 'chinese',
    en: 'english',
};

function post(response: WorkerResponse): void {
    self.postMessage(response);
}

const lastProgress = new Map<ProgressStage, number>();

function progress(stage: ProgressStage, value: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    const percent = Math.round(clamped * 100);
    if (lastProgress.get(stage) === percent) return;
    lastProgress.set(stage, percent);
    post({ type: 'progress', stage, progress: percent / 100 });
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 240);
}

function logFailure(stage: ProgressStage, error: unknown): void {
    console.error(`[screenclip-stt] ${stage}: ${safeErrorMessage(error)}`);
}

function normalizeText(text: string): string {
    return text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function appendChunk(cues: Cue[], chunk: ModelChunk, windowStart: number, windowEnd: number): void {
    const text = typeof chunk.text === 'string' ? chunk.text.trim() : '';
    if (!text) return;
    const windowDuration = Math.max(0, windowEnd - windowStart);
    if (!windowDuration) return;
    const timestamp = chunk.timestamp;
    const rawStart = timestamp?.[0];
    const rawEnd = timestamp?.[1];
    const start = windowStart + (typeof rawStart === 'number' && Number.isFinite(rawStart) ? rawStart : 0);
    const end = windowStart + (typeof rawEnd === 'number' && Number.isFinite(rawEnd)
        ? rawEnd
        : Math.min(windowEnd - windowStart, Math.max(0.25, text.length / 16)));
    const minimumDuration = Math.min(0.05, windowDuration);
    const boundedStart = Math.max(windowStart, Math.min(windowEnd - minimumDuration, start));
    const boundedEnd = Math.min(windowEnd, Math.max(boundedStart + minimumDuration, end));
    cues.push({ id: `cue-${cues.length + 1}`, start: boundedStart, end: boundedEnd, text });
}

function appendOutput(cues: Cue[], output: AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[], start: number, end: number): void {
    const outputs = Array.isArray(output) ? output : [output];
    for (const item of outputs) {
        const chunks = Array.isArray(item.chunks) ? item.chunks as ModelChunk[] : [];
        if (chunks.length) {
            for (const chunk of chunks) appendChunk(cues, chunk, start, end);
        } else {
            appendChunk(cues, { text: item.text, timestamp: [0, end - start] }, start, end);
        }
    }
}

function deduplicateCues(cues: Cue[]): Cue[] {
    const ordered = [...cues].sort((left, right) => left.start - right.start || left.end - right.end);
    const result: Cue[] = [];
    for (const cue of ordered) {
        const previous = result.at(-1);
        if (previous && normalizeText(previous.text) === normalizeText(cue.text) && cue.start <= previous.end + 0.75) {
            previous.end = Math.max(previous.end, cue.end);
            continue;
        }
        result.push({ ...cue, id: `cue-${result.length + 1}` });
    }
    return result;
}

async function run(request: WorkerRequest): Promise<void> {
    lastProgress.clear();
    progress('audio', 0);
    let transcriber: Transcriber | null = null;
    const cues: Cue[] = [];
    let processedWindows = 0;
    const windows = readAudioWindows(request.blob, value => {
        if (!transcriber) progress('audio', value);
    }, { splitOnSilence: request.language === 'auto' });

    try {
        while (true) {
            let next: IteratorResult<AudioWindow, void>;
            try {
                next = await windows.next();
            } catch (error) {
                logFailure('audio', error);
                post({ type: 'error', code: error instanceof NoAudioTrackError ? 'no-audio' : 'decode' });
                return;
            }
            if (next.done) break;
            const window = next.value;
            if (window.silent) continue;

            if (!transcriber) {
                progress('model', 0);
                try {
                    transcriber = await prepareTranscriber(value => progress('model', value)) as unknown as Transcriber;
                } catch (error) {
                    logFailure('model', error);
                    post({ type: 'error', code: 'model' });
                    return;
                }
                progress('model', 1);
                progress('transcribing', 0);
            }

            const language = request.language === 'auto' ? undefined : LANGUAGE_NAMES[request.language];
            try {
                const output = await transcriber(window.pcm, {
                    return_timestamps: true,
                    task: 'transcribe',
                    ...(language ? { language } : {}),
                });
                appendOutput(cues, output, window.start, window.end);
            } catch (error) {
                logFailure('transcribing', error);
                post({ type: 'error', code: 'inference' });
                return;
            }
            processedWindows++;
            const transcribingProgress = window.totalDuration
                ? Math.min(0.99, window.end / window.totalDuration)
                : processedWindows / Math.max(1, processedWindows + 1);
            progress('transcribing', transcribingProgress);
        }
    } finally {
        try { await windows.return?.(); } catch { /* Decoder disposal owns cancellation. */ }
    }
    progress('transcribing', 1);
    post({ type: 'done', cues: deduplicateCues(cues) });
}

let running = false;
self.addEventListener('message', event => {
    if (running || event.data?.type !== 'transcribe') return;
    running = true;
    void run(event.data as WorkerRequest).finally(() => { running = false; });
});
