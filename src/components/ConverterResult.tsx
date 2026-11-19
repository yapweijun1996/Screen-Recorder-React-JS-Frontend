import { CheckCircle, Download } from 'lucide-react';
import { useI18n } from '../i18n';
import { TranscriptPanel } from './editor/TranscriptPanel';
import { TranscriptionProvider, useTranscription } from './editor/useTranscription';
import type { useConverterSession } from './useConverterSession';

interface ConverterResultProps {
    output: NonNullable<ReturnType<typeof useConverterSession>['output']>;
    showFallback: boolean;
    awaitingDownload: boolean;
    onDownload: () => void;
    onReset: () => void;
}

function ResultCard({ output, showFallback, awaitingDownload, onDownload, onReset }: ConverterResultProps) {
    const { t } = useI18n();
    const { warnOnLeave } = useTranscription();
    const format = output.format.toUpperCase();

    function handleReset() {
        const warning = warnOnLeave ? 'converter.confirm.discardTranscript'
            : awaitingDownload ? 'converter.confirm.discard' : null;
        if (!warning || window.confirm(t(warning))) onReset();
    }

    return (
        <div className="status-success border rounded-2xl p-6 flex flex-col items-center gap-4 text-center animate-fade-in">
            <CheckCircle aria-hidden="true" size={36} className="status-success-icon" />
            <div>
                <p role="status" className="status-success-text font-semibold">{t('converter.done.title')}</p>
                <p className="text-xs text-th-tertiary mt-0.5">{output.fileName}</p>
                {showFallback && (
                    <p role="status" className="status-warning-text text-xs mt-2">
                        {t('converter.done.fallback', { format })}
                    </p>
                )}
                {awaitingDownload && <p className="mt-2 text-xs">{t('converter.done.unsaved')}</p>}
            </div>
            <a
                href={output.url}
                download={output.fileName}
                onClick={onDownload}
                className="status-success-action flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
            >
                <Download size={18} aria-hidden="true" />
                {t('converter.btn.download', { format })}
            </a>
            {output.format === 'mp3' && <TranscriptPanel titleKey="converter.transcript.title" />}
            <button onClick={handleReset} className="text-th-tertiary text-xs hover:text-white underline" type="button">
                {t('converter.btn.again')}
            </button>
        </div>
    );
}

export function ConverterResult(props: ConverterResultProps) {
    return (
        <TranscriptionProvider key={props.output.url} blob={props.output.format === 'mp3' ? props.output.blob : null}>
            <ResultCard {...props} />
        </TranscriptionProvider>
    );
}
