import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileAudio, Upload } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../utils/format';
import { TranscriptPanel } from './editor/TranscriptPanel';
import { TranscriptionProvider, useTranscription } from './editor/useTranscription';

function SelectedMp3({ file, clear }: { file: File; clear: () => void }) {
    const { t } = useI18n();
    const { warnOnLeave } = useTranscription();
    const removeFile = () => {
        if (!warnOnLeave || window.confirm(t('transcriber.confirmRemove'))) clear();
    };

    return (
        <div className="rounded-2xl border border-th-edge bg-th-card p-5">
            <div className="mb-4 flex items-start gap-3">
                <FileAudio size={22} className="shrink-0 text-indigo-500" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-th-primary">{file.name}</p>
                    <p className="text-xs text-th-secondary">{formatBytes(file.size)}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <TranscriptPanel titleKey="converter.transcript.title" initiallyOpen />
                <button type="button" onClick={removeFile} className="rounded text-xs text-th-secondary underline hover:text-th-primary">
                    {t('transcriber.remove')}
                </button>
            </div>
        </div>
    );
}

export function Mp3Transcriber() {
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [invalid, setInvalid] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    function select(candidate?: File) {
        if (!candidate) return;
        const isMp3 = candidate.size > 0 && (/\.mp3$/i.test(candidate.name) || /^(audio\/mpeg|audio\/mp3)$/i.test(candidate.type));
        setInvalid(!isMp3);
        if (isMp3) setFile(candidate);
    }

    function browse(event: ChangeEvent<HTMLInputElement>) {
        select(event.currentTarget.files?.[0]);
        event.currentTarget.value = '';
    }

    function drop(event: DragEvent<HTMLButtonElement>) {
        event.preventDefault();
        select(event.dataTransfer.files[0]);
    }

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
            <div>
                <h2 className="text-2xl font-bold text-th-primary">{t('converter.transcript.title')}</h2>
                <p className="mt-1 text-sm text-th-secondary">{t('transcriber.description')}</p>
            </div>
            {file ? (
                <TranscriptionProvider blob={file}>
                    <SelectedMp3 file={file} clear={() => setFile(null)} />
                </TranscriptionProvider>
            ) : (
                <>
                    <input ref={input} type="file" accept=".mp3,audio/mpeg,audio/mp3" className="hidden" onChange={browse} />
                    <button
                        type="button"
                        onClick={() => input.current?.click()}
                        onDragOver={event => event.preventDefault()}
                        onDrop={drop}
                        className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-th-edge bg-th-card/50 px-6 py-16 text-sm font-medium text-th-primary transition-colors hover:border-indigo-400/60 hover:bg-th-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                    >
                        <Upload size={28} className="text-th-tertiary" aria-hidden="true" />
                        {t('transcriber.pick')}
                    </button>
                    {invalid && <p role="alert" className="status-error-text text-sm">{t('transcriber.invalid')}</p>}
                </>
            )}
        </main>
    );
}
