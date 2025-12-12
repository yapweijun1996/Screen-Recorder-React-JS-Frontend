import React from 'react';
import { Button } from '../Button';
import { Download, Loader2, Settings, ChevronDown, Zap, Sparkles, Crown, Film } from 'lucide-react';
import { VideoQualityPreset, VIDEO_QUALITY_PRESETS } from '../../types';
import { useI18n } from '../../i18n';

type Resolution = 'original' | '720p' | '1080p' | '4k';
type ExportFormat = 'mp4' | 'webm';
type FrameRate = 24 | 30 | 60;

interface EditorExportPanelProps {
    // state
    showAdvanced: boolean;
    onToggleAdvanced: () => void;

    selectedQuality: VideoQualityPreset;
    onSelectQuality: (preset: VideoQualityPreset) => void;

    selectedResolution: Resolution;
    onSelectResolution: (res: Resolution) => void;

    selectedFormat: ExportFormat;
    onSelectFormat: (fmt: ExportFormat) => void;

    selectedFps: FrameRate;
    onSelectFps: (fps: FrameRate) => void;

    customCrf: number;
    onChangeCrf: (crf: number) => void;

    estimatedSize: string;

    isProcessing: boolean;
    processingProgress: number;
    processingEta: string | null;

    exportUrl: string | null;

    playbackError: string | null;

    // actions
    onApplyHighQualityPreset: () => void;
    onExportTrimmed: () => void;
    onExportFull: () => void;
    onClearExportUrl: () => void;

    // download
    downloadFileName: string;
}

const qualityIcons: Record<VideoQualityPreset, React.ReactNode> = {
    low: <Zap size={14} />,
    medium: <Film size={14} />,
    high: <Sparkles size={14} />,
    lossless: <Crown size={14} />
};

export const EditorExportPanel: React.FC<EditorExportPanelProps> = ({
    showAdvanced,
    onToggleAdvanced,
    selectedQuality,
    onSelectQuality,
    selectedResolution,
    onSelectResolution,
    selectedFormat,
    onSelectFormat,
    selectedFps,
    onSelectFps,
    customCrf,
    onChangeCrf,
    estimatedSize,
    isProcessing,
    processingProgress,
    processingEta,
    exportUrl,
    playbackError,
    onApplyHighQualityPreset,
    onExportTrimmed,
    onExportFull,
    onClearExportUrl,
    downloadFileName,
}) => {
    const { t } = useI18n();

    return (
        <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur">
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{t('editor.export.title')}</div>
                            <div className="text-xs text-slate-400">
                                {t(`quality.${selectedQuality}.label`)} • {selectedFormat.toUpperCase()}
                            </div>
                        </div>

                        <button
                            className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
                            onClick={onToggleAdvanced}
                            type="button"
                        >
                            <Settings size={16} className="text-purple-300" />
                            {t('editor.export.settings')}
                            <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Quick preset helper */}
                    <div className="flex items-center justify-between gap-2 bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-400">
                            {t('editor.export.quickHint')}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onApplyHighQualityPreset}
                            className="text-xs px-3"
                            disabled={isProcessing}
                        >
                            {t('editor.export.quickButton')}
                        </Button>
                    </div>

                    {/* Estimated size */}
                    <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>{t('editor.export.estimated')}</span>
                        <span className="text-indigo-300 font-medium">{estimatedSize}</span>
                    </div>

                    {showAdvanced && (
                        <div className="space-y-4 animate-fade-in">
                            {/* Quality Preset */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.quality')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((preset) => {
                                        return (
                                            <button
                                                key={preset}
                                                onClick={() => onSelectQuality(preset)}
                                                className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${selectedQuality === preset
                                                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                                                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                    }`}
                                                disabled={isProcessing}
                                                type="button"
                                            >
                                                {qualityIcons[preset]}
                                                <div className="text-sm font-medium leading-tight">{t(`quality.${preset}.label`)}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] text-slate-500">{t(`quality.${selectedQuality}.description`)}</p>
                            </div>

                            {/* CRF */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.crf')}</label>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={1}
                                        value={customCrf}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (!Number.isFinite(val)) return;
                                            onChangeCrf(Math.min(Math.max(val, 0), 30));
                                        }}
                                        className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        disabled={selectedQuality === 'lossless' || isProcessing}
                                    />
                                    <span className="text-[11px] text-slate-500">
                                        {t('editor.export.crfHint')}
                                    </span>
                                </div>
                            </div>

                            {/* Resolution */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.resolution')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['original', '720p', '1080p', '4k'] as Resolution[]).map((res) => (
                                        <button
                                            key={res}
                                            onClick={() => onSelectResolution(res)}
                                        className={`py-2 px-3 rounded-xl border text-sm transition-all ${selectedResolution === res
                                                ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                            }`}
                                            disabled={isProcessing}
                                            type="button"
                                        >
                                            {res === 'original' ? t('editor.export.resolutionOriginal') : res}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* FPS */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.frameRate')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {([24, 30, 60] as FrameRate[]).map((fps) => (
                                        <button
                                            key={fps}
                                            onClick={() => onSelectFps(fps)}
                                            className={`py-2 px-3 rounded-xl border text-sm transition-all ${selectedFps === fps
                                                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                }`}
                                            disabled={isProcessing}
                                        type="button"
                                    >
                                        {fps}
                                    </button>
                                ))}
                                </div>
                                <p className="text-[11px] text-slate-500">{t('editor.export.frameRateHint')}</p>
                            </div>

                            {/* Format */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.format')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['mp4', 'webm'] as ExportFormat[]).map((fmt) => (
                                        <button
                                            key={fmt}
                                            onClick={() => onSelectFormat(fmt)}
                                            className={`py-2 px-3 rounded-xl border text-sm uppercase transition-all ${selectedFormat === fmt
                                                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                }`}
                                            disabled={isProcessing}
                                            type="button"
                                        >
                                            {fmt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Processing / Result */}
                    {isProcessing && (
                        <div className="bg-indigo-900/25 border border-indigo-500/30 p-4 rounded-xl space-y-3 animate-fade-in">
                            <div className="flex items-center gap-2 text-indigo-300">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm font-medium">{t('editor.export.processing')}</span>
                            </div>
                            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                    style={{ width: `${processingProgress}%` }}
                                />
                            </div>
                            <div className="text-[11px] text-slate-400 flex justify-between">
                                <span>{processingProgress}%</span>
                                <span>{t('editor.export.eta')}: {processingEta ?? t('editor.export.etaEstimating')}</span>
                            </div>
                        </div>
                    )}

                    {exportUrl && !isProcessing && (
                        <div className="bg-emerald-900/25 border border-emerald-500/30 p-4 rounded-xl text-center space-y-3 animate-fade-in">
                            <p className="text-emerald-300 text-sm font-medium">{t('editor.export.ready')}</p>
                            <a
                                href={exportUrl}
                                download={downloadFileName}
                                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
                            >
                                <Download size={20} />
                                {t('editor.export.download', { format: selectedFormat.toUpperCase() })}
                            </a>
                            <button
                                onClick={onClearExportUrl}
                                className="text-slate-400 text-xs hover:text-white underline"
                                type="button"
                            >
                                {t('editor.export.exportAnother')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Sticky actions */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/70">
                    {!exportUrl && (
                        <div className="space-y-2">
                            <Button
                                variant="primary"
                                className="w-full py-3"
                                onClick={onExportTrimmed}
                                isLoading={isProcessing}
                                disabled={!!playbackError || isProcessing}
                            >
                                {t('editor.export.exportTrimmed', { label: t(`quality.${selectedQuality}.label`) })}
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs text-slate-300"
                                onClick={onExportFull}
                                disabled={!!playbackError || isProcessing}
                            >
                                {t('editor.export.exportFull')}
                            </Button>
                        </div>
                    )}

                    {playbackError && (
                        <div className="mt-3 text-[11px] text-slate-500">
                            {t('editor.export.playbackIssue')}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};
