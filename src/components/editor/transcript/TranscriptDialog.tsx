import React, { useId, useRef, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileAudio,
    FileText,
    Loader2,
    Mic2,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { Language, TranscriptionError } from '../../../services/stt/protocol';
import { CueList } from './CueList';
import { clampProgress } from './format';
import type { Translate, TranscriptionState } from './types';
import { useDialogFocus } from './useDialogFocus';

interface TranscriptDialogProps {
    state: TranscriptionState;
    language: Language;
    onLanguageChange: (language: Language) => void;
    onSeek?: (seconds: number) => void;
    titleKey: string;
    onClose: () => void;
}

const getErrorMessage = (error: TranscriptionError | null, t: Translate) => {
    if (error === 'no-audio') return t('editor.transcript.errorNoAudio');
    if (error === 'model') return t('editor.transcript.errorModel');
    if (error === 'decode') return t('editor.transcript.errorDecode');
    return t('editor.transcript.errorInference');
};

const getStatusLabel = (status: TranscriptionState['status'], t: Translate) => {
    if (status === 'model') return t('editor.transcript.processingModel');
    if (status === 'audio') return t('editor.transcript.processingAudio');
    return t('editor.transcript.processingTranscribing');
};

export const TranscriptDialog: React.FC<TranscriptDialogProps> = ({ state, language, onLanguageChange, onSeek, onClose, titleKey }) => {
    const { t } = useI18n();
    const [replaceConfirm, setReplaceConfirm] = useState(false);
    const [clearConfirm, setClearConfirm] = useState(false);
    const [clearingModel, setClearingModel] = useState(false);
    const [clearError, setClearError] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const { status, progress, cues, error, start, cancel, updateCue, download, clearModel } = state;
    const cueCount = cues.length;
    const isBusy = status === 'model' || status === 'audio' || status === 'transcribing';
    const canClearModel = !isBusy && (status === 'idle' || status === 'done' || status === 'error');

    useDialogFocus(dialogRef, onClose);

    const handleSeek = (seconds: number) => {
        onSeek?.(seconds);
        onClose();
    };

    const requestStart = () => {
        if (cueCount > 0) {
            setReplaceConfirm(true);
            return;
        }
        start(language);
    };

    const replaceCaptions = () => {
        setReplaceConfirm(false);
        start(language);
    };

    const handleClearModel = async () => {
        setClearingModel(true);
        setClearError(false);
        try {
            await clearModel();
            setClearConfirm(false);
        } catch {
            setClearError(true);
        } finally {
            setClearingModel(false);
        }
    };

    const languages: Array<{ value: Language; label: string }> = [
        { value: 'auto', label: 'editor.transcript.languageAuto' },
        { value: 'zh', label: 'editor.transcript.languageChinese' },
        { value: 'en', label: 'editor.transcript.languageEnglish' },
    ];

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                id={titleId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${titleId}-heading`}
                tabIndex={-1}
                className="flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-th-edge bg-th-surface text-th-primary shadow-2xl outline-none sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3 border-b border-th-edge bg-th-card/60 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                        <h2 id={`${titleId}-heading`} className="flex items-center gap-2 text-sm font-semibold">
                            <FileAudio size={16} className="text-indigo-500" aria-hidden="true" />
                            {t(titleKey)}
                        </h2>
                        <p className="mt-1 text-xs text-th-tertiary">
                            {t('editor.transcript.subtitle')}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label={t('editor.transcript.close')}
                        onClick={onClose}
                        className="rounded-md p-1.5 text-th-tertiary transition-colors hover:bg-th-input hover:text-th-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-th-secondary">{t('editor.transcript.language')}</span>
                                <span className="text-right text-[10px] text-th-tertiary">
                                    {t('editor.transcript.modelNote')}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 rounded-lg border border-th-edge bg-th-deep/40 p-1">
                                {languages.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={language === option.value}
                                        disabled={isBusy}
                                        onClick={() => onLanguageChange(option.value)}
                                        className={`rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 ${language === option.value
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-th-secondary hover:bg-th-input hover:text-th-primary'
                                            }`}
                                    >
                                        {t(option.label)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isBusy && (
                            <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-500/30 dark:bg-indigo-950/30" role="status" aria-live="polite">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="flex min-w-0 items-center gap-2 font-medium text-indigo-700 dark:text-indigo-200">
                                        <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden="true" />
                                        <span className="truncate">{getStatusLabel(status, t)}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-indigo-700 dark:text-indigo-200">{clampProgress(progress)}%</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/60">
                                    <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 dark:bg-indigo-400" style={{ width: `${clampProgress(progress)}%` }} />
                                </div>
                                <button
                                    type="button"
                                    onClick={cancel}
                                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                                >
                                    <X size={13} aria-hidden="true" />
                                    {t('editor.transcript.cancel')}
                                </button>
                            </section>
                        )}

                        {status === 'error' && (
                            <div role="alert" className="status-error flex items-start gap-2 rounded-lg border p-3 text-xs">
                                <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <p>{getErrorMessage(error, t)}</p>
                                    <button type="button" onClick={requestStart} className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                        <RotateCcw size={12} aria-hidden="true" />
                                        {t('editor.transcript.retry')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!isBusy && status !== 'error' && cueCount === 0 && (
                            <div className="rounded-xl border border-dashed border-th-edge bg-th-deep/30 px-4 py-6 text-center text-xs text-th-tertiary">
                                {status === 'done'
                                    ? t('editor.transcript.noSpeech')
                                    : t('editor.transcript.empty')}
                            </div>
                        )}

                        {cueCount > 0 && (
                            <CueList cues={cues} labelId={`${titleId}-captions`} onSeek={onSeek && handleSeek} updateCue={updateCue} t={t} />
                        )}
                    </div>
                </div>

                <div className="space-y-3 border-t border-th-edge bg-th-card/40 px-4 py-3 sm:px-5">
                    {replaceConfirm && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100" role="alertdialog" aria-label={t('editor.transcript.regenerateConfirm')}>
                            <p>{t('editor.transcript.regenerateConfirm')}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={replaceCaptions} className="rounded-md bg-amber-600 px-2.5 py-1.5 font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                                    {t('editor.transcript.replace')}
                                </button>
                                <button type="button" onClick={() => setReplaceConfirm(false)} className="rounded-md border border-amber-300 px-2.5 py-1.5 font-medium hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/40 dark:hover:bg-amber-950/50">
                                    {t('editor.transcript.keep')}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            data-testid="transcript-start"
                            disabled={isBusy}
                            onClick={requestStart}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Mic2 size={13} aria-hidden="true" />
                            {t(cueCount > 0 ? 'editor.transcript.regenerate' : 'editor.transcript.generate')}
                        </button>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                data-testid="transcript-download-srt"
                                disabled={cueCount === 0 || isBusy}
                                onClick={() => download('srt')}
                                className="inline-flex items-center gap-1 rounded-md border border-th-edge px-2.5 py-1.5 text-[11px] font-medium text-th-secondary transition-colors hover:bg-th-input hover:text-th-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Download size={12} aria-hidden="true" />
                                {t('editor.transcript.downloadSrt')}
                            </button>
                            <button
                                type="button"
                                disabled={cueCount === 0 || isBusy}
                                onClick={() => download('txt')}
                                className="inline-flex items-center gap-1 rounded-md border border-th-edge px-2.5 py-1.5 text-[11px] font-medium text-th-secondary transition-colors hover:bg-th-input hover:text-th-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <FileText size={12} aria-hidden="true" />
                                {t('editor.transcript.downloadTxt')}
                            </button>
                        </div>
                    </div>

                    {clearConfirm ? (
                        <div className="rounded-lg border border-th-edge bg-th-deep/40 p-3 text-xs text-th-secondary" role="alertdialog" aria-label={t('editor.transcript.clearModelConfirm')}>
                            <p>{t('editor.transcript.clearModelConfirm')}</p>
                            <div className="mt-2 flex gap-2">
                                <button type="button" disabled={clearingModel} onClick={handleClearModel} className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 font-semibold text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50">
                                    {clearingModel && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                                    {t('editor.transcript.clear')}
                                </button>
                                <button type="button" disabled={clearingModel} onClick={() => setClearConfirm(false)} className="rounded-md border border-th-edge px-2.5 py-1.5 font-medium text-th-secondary hover:bg-th-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50">
                                    {t('editor.transcript.keep')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-th-tertiary">
                            <span>{t('editor.transcript.modelStorage')}</span>
                            <button
                                type="button"
                                disabled={!canClearModel || clearingModel}
                                onClick={() => setClearConfirm(true)}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-th-tertiary underline underline-offset-2 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Trash2 size={11} aria-hidden="true" />
                                {t('editor.transcript.clearModel')}
                            </button>
                        </div>
                    )}
                    {clearError && (
                        <p role="alert" className="text-[11px] text-red-600 dark:text-red-300">
                            {t('editor.transcript.clearModelError')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
