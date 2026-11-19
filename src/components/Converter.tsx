import React, { useState, useRef } from 'react';
import { Upload, FileVideo, Download, X, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { useConverterSession, type ConverterFormat, type ConverterStatus } from './useConverterSession';
import { VIDEO_QUALITY_PRESETS, VideoQualityPreset } from '../types';
import { formatBytes, generateFileName } from '../utils/format';
import { Button } from './Button';
import { useI18n } from '../i18n';
import { isLikelyVideoInput } from '../services/webcodecs/inputValidation';

const QUALITY_OPTIONS: VideoQualityPreset[] = ['low', 'medium', 'high'];
const FORMAT_OPTIONS: ConverterFormat[] = ['mp4', 'mp3'];

export type { ConverterStatus } from './useConverterSession';

export const Converter: React.FC<{ onStatusChange: (status: ConverterStatus) => void }> = ({ onStatusChange }) => {
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [quality, setQuality] = useState<VideoQualityPreset>('medium');
    const [format, setFormat] = useState<ConverterFormat>('mp4');
    const [inputError, setInputError] = useState<string | null>(null);
    const operation = useConverterSession(t, onStatusChange);
    const { isProcessing: isConverting, progress, eta, error } = operation;
    const outputUrl = operation.output?.url ?? null;
    const outputFormat = operation.output?.format ?? 'mp4';
    const inputRef = useRef<HTMLInputElement>(null);

    const loadFile = (f: File) => {
        if (!isLikelyVideoInput(f)) {
            setInputError(t('converter.error'));
            return;
        }
        setInputError(null);
        setFile(f);
        operation.cancel();
        operation.clearOutput();
        operation.clearError();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) loadFile(f);
        e.target.value = '';
    };
    const handleConvert = async () => {
        if (!file) return;
        // File already extends Blob; avoid copying the whole input into memory.
        await operation.run(file, { quality, format }, file.name.replace(/\.[^.]+$/, ''));
    };
    const handleCancel = () => {
        if (window.confirm(t('converter.confirm.cancel'))) operation.cancel();
    };
    const handleReset = () => {
        if (operation.awaitingDownload && !window.confirm(t('converter.confirm.discard'))) return;
        operation.cancel();
        operation.clearOutput();
        operation.clearError();
        setInputError(null);
        setFile(null);
    };

    const outputFileName = operation.output?.fileName ?? generateFileName('converted', outputFormat);

    return (
        <main className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">
            <div>
                <h2 className="text-2xl font-bold text-th-primary">{t('converter.title')}</h2>
                <p className="mt-1 text-sm text-th-secondary">{t('converter.subtitle')}</p>
            </div>

            {!file && (
                <>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*,.avi,.flv,.m4v,.mkv,.mov,.mp4,.ogv,.webm,.wmv"
                        className="hidden"
                        onChange={handleFileInput}
                    />
                    <button
                        type="button"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        aria-label={t('converter.drop.idle')}
                        aria-describedby="converter-file-hint"
                        className={`
                            cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
                            flex flex-col items-center justify-center gap-3 py-16 px-6 text-center
                            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500
                            ${isDragging
                                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                                : 'border-th-edge hover:border-indigo-400/60 bg-th-card/50 hover:bg-th-card'
                            }
                        `}
                    >
                        <span className={`p-4 rounded-full ${isDragging ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-th-surface'}`}>
                            <Upload aria-hidden="true" size={28} className={isDragging ? 'text-indigo-500' : 'text-th-tertiary'} />
                        </span>
                        <span>
                            <span className="block font-medium text-th-primary">
                                {isDragging ? t('converter.drop.active') : t('converter.drop.idle')}
                            </span>
                            <span id="converter-file-hint" className="block text-xs text-th-tertiary mt-1">{t('converter.drop.hint')}</span>
                        </span>
                    </button>
                    {inputError && <p role="alert" className="status-error-text text-xs text-center mt-2">{inputError}</p>}
                </>
            )}

            {/* File loaded card */}
            {file && !outputUrl && (
                <div className="bg-th-card rounded-2xl border border-th-edge p-5 flex flex-col gap-5">
                    {/* File info */}
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl flex-shrink-0">
                            <FileVideo size={22} className="text-indigo-500 dark:text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-th-primary truncate">{file.name}</p>
                            <p className="text-xs text-th-tertiary mt-0.5">
                                {formatBytes(file.size)} · {file.type || 'video'}
                            </p>
                        </div>
                        <button
                            onClick={handleReset}
                            className="text-th-tertiary hover:text-th-primary transition-colors"
                            aria-label="Remove file"
                            disabled={isConverting}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Quality selector */}
                    {!isConverting && (
                        <div className="space-y-4">
                            <fieldset>
                                <legend className="text-xs font-medium text-th-secondary mb-2">{t('converter.format.label')}</legend>
                                <div className="grid grid-cols-2 gap-2">
                                    {FORMAT_OPTIONS.map(option => (
                                        <label key={option} className="cursor-pointer">
                                            <input
                                                type="radio" name="converter-format" value={option} checked={format === option}
                                                onChange={() => setFormat(option)} className="peer sr-only"
                                            />
                                            <span className="block rounded-xl border border-th-edge px-3 py-2.5 text-sm font-semibold
                                                peer-checked:border-indigo-500 peer-checked:bg-indigo-50 dark:peer-checked:bg-indigo-950/50
                                                peer-checked:text-indigo-700 dark:peer-checked:text-indigo-300
                                                peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-500">
                                                {option.toUpperCase()}{' '}
                                                <span className="text-xs font-normal ml-2">{t(`converter.format.${option}`)}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <p className="text-xs font-medium text-th-secondary mb-2">{t('converter.quality.label')}</p>
                            <div className="grid grid-cols-3 gap-2">
                                {QUALITY_OPTIONS.map((q) => {
                                    const preset = VIDEO_QUALITY_PRESETS[q];
                                    return (
                                        <button
                                            key={q}
                                            type="button"
                                            aria-pressed={quality === q}
                                            onClick={() => setQuality(q)}
                                            className={`
                                                rounded-xl border px-3 py-2.5 text-left transition-all
                                                ${quality === q
                                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                                    : 'border-th-edge bg-th-surface hover:border-indigo-400/50 text-th-secondary'
                                                }
                                            `}
                                        >
                                            <p className="text-xs font-semibold capitalize">{t(`quality.${q}.label`)}</p>
                                            <p className="text-xs mt-0.5">{format === 'mp3' ? preset.audioBitrate : t(`quality.${q}.description`)}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {isConverting && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm font-medium">{t('converter.progress.label')}</span>
                            </div>
                            <div role="progressbar" aria-label={t('converter.progress.label')} aria-valuenow={progress}
                                className="w-full h-2 bg-th-input rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] text-th-tertiary">
                                <span>{progress}%</span>
                                {eta && <span>ETA: {eta}</span>}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div role="alert" className="status-error border rounded-xl p-3 text-xs">
                            {error}
                        </div>
                    )}

                    {!isConverting && !error && format === 'mp4' && (
                        <p role="status" className="status-warning border rounded-xl p-3 text-xs">
                            {t('converter.fallback.notice')}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        {isConverting ? (
                            <Button variant="danger" className="flex-1" onClick={handleCancel}>
                                <X size={15} />
                                {t('converter.btn.cancel')}
                            </Button>
                        ) : (
                            <Button variant="primary" className="flex-1 py-3" onClick={handleConvert}>
                                <RefreshCw size={15} />
                                {t('converter.btn.convert', { format: format.toUpperCase() })}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Done card */}
            {outputUrl && (
                <div className="status-success border rounded-2xl p-6 flex flex-col items-center gap-4 text-center animate-fade-in">
                    <CheckCircle aria-hidden="true" size={36} className="status-success-icon" />
                    <div>
                        <p role="status" className="status-success-text font-semibold">{t('converter.done.title')}</p>
                        <p className="text-xs text-th-tertiary mt-0.5">{outputFileName}</p>
                        {format === 'mp4' && outputFormat !== 'mp4' && (
                            <p role="status" className="status-warning-text text-xs mt-2">
                                {t('converter.done.fallback', { format: outputFormat.toUpperCase() })}
                            </p>
                        )}
                        {operation.awaitingDownload && <p className="mt-2 text-xs">{t('converter.done.unsaved')}</p>}
                    </div>
                    <a
                        href={outputUrl}
                        download={outputFileName}
                        onClick={operation.acknowledgeDownload}
                        className="status-success-action flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
                    >
                        <Download size={18} />
                        {t('converter.btn.download', { format: outputFormat.toUpperCase() })}
                    </a>
                    <button
                        onClick={handleReset}
                        className="text-th-tertiary text-xs hover:text-white underline"
                        type="button"
                    >
                        {t('converter.btn.again')}
                    </button>
                </div>
            )}
        </main>
    );
};
