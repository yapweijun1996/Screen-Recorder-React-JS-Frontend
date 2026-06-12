import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileVideo, Download, X, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { exportService } from '../services/exportService';
import { VIDEO_QUALITY_PRESETS, VideoQualityPreset } from '../types';
import { formatBytes, generateFileName } from '../utils/format';
import { Button } from './Button';
import { useI18n } from '../i18n';

const QUALITY_OPTIONS: VideoQualityPreset[] = ['low', 'medium', 'high'];

export const Converter: React.FC = () => {
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [quality, setQuality] = useState<VideoQualityPreset>('medium');
    const [isConverting, setIsConverting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [eta, setEta] = useState<string | null>(null);
    const [outputUrl, setOutputUrl] = useState<string | null>(null);
    const [outputFormat, setOutputFormat] = useState<'mp4' | 'webm'>('mp4');
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = ({ ratio }: { ratio: number }) => {
            const clamped = Math.max(0, Math.min(1, ratio));
            setProgress(Math.round(clamped * 100));
            if (startTimeRef.current && clamped > 0) {
                const elapsed = Date.now() - startTimeRef.current;
                const etaMs = elapsed / clamped - elapsed;
                if (Number.isFinite(etaMs) && etaMs >= 0) {
                    const secs = Math.round(etaMs / 1000);
                    const m = Math.floor(secs / 60);
                    const s = Math.max(secs % 60, 0);
                    setEta(m > 0 ? `${m}m ${s}s` : `${s}s`);
                }
            }
        };
        exportService.onProgress(handler);
        return () => exportService.offProgress(handler);
    }, []);

    useEffect(() => {
        return () => { if (outputUrl) URL.revokeObjectURL(outputUrl); };
    }, [outputUrl]);

    const loadFile = (f: File) => {
        setFile(f);
        setOutputUrl(null);
        setOutputFormat('mp4');
        setError(null);
        setProgress(0);
        setEta(null);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFile(f);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) loadFile(f);
        e.target.value = '';
    };

    const handleConvert = async () => {
        if (!file) return;
        setError(null);
        setIsConverting(true);
        setProgress(0);
        setEta(null);
        setOutputUrl(null);
        startTimeRef.current = Date.now();

        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: file.type || 'video/webm' });
            const preset = VIDEO_QUALITY_PRESETS[quality];
            const output = await exportService.processVideo(
                blob,
                { quality, format: 'mp4', resolution: 'original', fps: 30, crf: preset.crf },
                ctrl.signal,
            );
            setOutputFormat(output.format);
            setOutputUrl(URL.createObjectURL(output.blob));
        } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (!isAbort) {
                console.error(err);
                setError(t('converter.error'));
            }
        } finally {
            setIsConverting(false);
            setProgress(0);
            setEta(null);
            startTimeRef.current = null;
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    };

    const handleCancel = () => { abortRef.current?.abort(); };

    const handleReset = () => {
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        setFile(null);
        setOutputUrl(null);
        setOutputFormat('mp4');
        setError(null);
        setProgress(0);
    };

    const outputFileName = file
        ? generateFileName(file.name.replace(/\.[^.]+$/, ''), outputFormat)
        : generateFileName('converted', outputFormat);

    return (
        <main className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">
            {/* Page header */}
            <div>
                <h2 className="text-2xl font-bold text-th-primary">{t('converter.title')}</h2>
                <p className="mt-1 text-sm text-th-secondary">{t('converter.subtitle')}</p>
            </div>

            {/* Drop zone */}
            {!file && (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`
                        cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
                        flex flex-col items-center justify-center gap-3 py-16 px-6 text-center
                        ${isDragging
                            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                            : 'border-th-edge hover:border-indigo-400/60 bg-th-card/50 hover:bg-th-card'
                        }
                    `}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleFileInput}
                    />
                    <div className={`p-4 rounded-full ${isDragging ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-th-surface'}`}>
                        <Upload size={28} className={isDragging ? 'text-indigo-500' : 'text-th-tertiary'} />
                    </div>
                    <div>
                        <p className="font-medium text-th-primary">
                            {isDragging ? t('converter.drop.active') : t('converter.drop.idle')}
                        </p>
                        <p className="text-xs text-th-tertiary mt-1">{t('converter.drop.hint')}</p>
                    </div>
                </div>
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
                        <div>
                            <p className="text-xs font-medium text-th-secondary mb-2">{t('converter.quality.label')}</p>
                            <div className="grid grid-cols-3 gap-2">
                                {QUALITY_OPTIONS.map((q) => {
                                    const preset = VIDEO_QUALITY_PRESETS[q];
                                    return (
                                        <button
                                            key={q}
                                            type="button"
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
                                            <p className="text-[10px] mt-0.5 opacity-70">{preset.description}</p>
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
                            <div className="w-full h-2 bg-th-input rounded-full overflow-hidden">
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
                        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-200 text-xs">
                            {error}
                        </div>
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
                                {t('converter.btn.convert')}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Done card */}
            {outputUrl && (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-6 flex flex-col items-center gap-4 text-center animate-fade-in">
                    <CheckCircle size={36} className="text-emerald-400" />
                    <div>
                        <p className="font-semibold text-emerald-300">{t('converter.done.title')}</p>
                        <p className="text-xs text-th-tertiary mt-0.5">{outputFileName}</p>
                    </div>
                    <a
                        href={outputUrl}
                        download={outputFileName}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
                    >
                        <Download size={18} />
                        {t('converter.btn.download')}
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
