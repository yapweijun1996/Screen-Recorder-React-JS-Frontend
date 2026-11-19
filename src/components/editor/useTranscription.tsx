import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { Cue, Language, ProgressStage, TranscriptionError, WorkerRequest, WorkerResponse } from '../../services/stt/protocol';
import { serializeTranscript, type TranscriptFormat } from '../../services/stt/transcriptFiles';
import { taskActivity } from '../../services/taskActivity';
import { generateFileName } from '../../utils/format';

type Status = 'idle' | ProgressStage | 'done' | 'error';

function useRecordingTranscription(blob: Blob | null) {
    const [status, setStatus] = useState<Status>('idle');
    const [progress, setProgress] = useState(0);
    const [cues, setCues] = useState<Cue[]>([]);
    const [error, setError] = useState<TranscriptionError | null>(null);
    const [unsaved, setUnsaved] = useState(false);
    const job = useRef<{ worker: Worker; release: () => void } | null>(null);
    const pendingOutput = useRef<(() => void) | null>(null);

    function finishJob() {
        const current = job.current;
        job.current = null;
        current?.worker.terminate();
        current?.release();
    }

    function acknowledgeOutput() {
        pendingOutput.current?.();
        pendingOutput.current = null;
        setUnsaved(false);
    }

    function protectOutput() {
        pendingOutput.current ??= taskActivity.begin();
        setUnsaved(true);
    }

    useEffect(() => () => {
        finishJob();
        pendingOutput.current?.();
        pendingOutput.current = null;
    }, []);

    const warnOnLeave = unsaved || status === 'model' || status === 'audio' || status === 'transcribing';
    useEffect(() => {
        if (!warnOnLeave) return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = true;
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [warnOnLeave]);

    function start(language: Language) {
        if (!blob || job.current) return;
        setStatus('audio');
        setProgress(0);
        setError(null);
        const fail = (code: TranscriptionError) => {
            finishJob();
            setError(code);
            setStatus('error');
        };
        try {
            const worker = new Worker(new URL('../../services/stt/transcription.worker.ts', import.meta.url), { type: 'module' });
            const current = { worker, release: taskActivity.begin() };
            job.current = current;
            worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
                if (job.current !== current) return;
                if (data.type === 'progress') {
                    setStatus(data.stage);
                    setProgress(Number.isFinite(data.progress) ? Math.max(0, Math.min(1, data.progress)) : 0);
                } else if (data.type === 'error') {
                    fail(data.code);
                } else if (data.type === 'done') {
                    if (data.cues.length) protectOutput();
                    else acknowledgeOutput();
                    setCues(data.cues);
                    finishJob();
                    setProgress(1);
                    setStatus('done');
                }
            };
            worker.onerror = event => {
                event.preventDefault();
                if (job.current === current) fail('inference');
            };
            worker.onmessageerror = () => {
                if (job.current === current) fail('inference');
            };
            worker.postMessage({ type: 'transcribe', blob, language } satisfies WorkerRequest);
        } catch {
            fail('inference');
        }
    }

    function cancel() {
        finishJob();
        setStatus(cues.length ? 'done' : 'idle');
        setProgress(0);
        setError(null);
    }

    function updateCue(id: string, text: string) {
        const updated = cues.map(cue => cue.id === id ? { ...cue, text } : cue);
        if (updated.some(cue => cue.text.trim())) protectOutput();
        else acknowledgeOutput();
        setCues(updated);
    }

    function download(format: TranscriptFormat) {
        const contents = serializeTranscript(cues, format);
        if (!contents) return;
        const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = generateFileName('screenclip-transcript', format);
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        acknowledgeOutput();
    }

    async function clearModel() {
        if (job.current) return;
        const { clearModelCache } = await import('../../services/stt/modelStorage');
        await clearModelCache();
    }

    return { status, progress, cues, error, warnOnLeave, start, cancel, updateCue, download, clearModel };
}

const TranscriptionContext = createContext<ReturnType<typeof useRecordingTranscription> | null>(null);

export function TranscriptionProvider({ blob, children }: PropsWithChildren<{ blob: Blob | null }>) {
    const value = useRecordingTranscription(blob);
    return <TranscriptionContext.Provider value={value}>{children}</TranscriptionContext.Provider>;
}

export function useTranscription() {
    const value = useContext(TranscriptionContext);
    if (!value) throw new Error('Transcription requires a recording provider');
    return value;
}
