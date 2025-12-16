import React from 'react';
import { Zap, Sparkles, Crown, Film } from 'lucide-react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../../types';
import { VIDEO_QUALITY_PRESETS } from '../../../types';
import { useI18n } from '../../../i18n';

const qualityIcons: Record<VideoQualityPreset, React.ReactNode> = {
    low: <Zap size={14} />,
    medium: <Film size={14} />,
    high: <Sparkles size={14} />,
    lossless: <Crown size={14} />
};

interface EditorExportAdvancedSettingsProps {
    selectedQuality: VideoQualityPreset;
    onSelectQuality: (preset: VideoQualityPreset) => void;

    selectedResolution: ExportResolution;
    onSelectResolution: (res: ExportResolution) => void;

    selectedFormat: ExportFormat;
    onSelectFormat: (fmt: ExportFormat) => void;

    selectedFps: ExportFrameRateOption;
    onSelectFps: (fps: ExportFrameRateOption) => void;

    customCrf: number;
    onChangeCrf: (crf: number) => void;

    isProcessing: boolean;
}

export const EditorExportAdvancedSettings: React.FC<EditorExportAdvancedSettingsProps> = ({
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
    isProcessing,
}) => {
    const { t } = useI18n();

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Quality Preset */}
            <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase tracking-wide">{t('editor.export.quality')}</label>
                <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((preset) => (
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
                    ))}
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
                    {(['original', '720p', '1080p', '4k'] as ExportResolution[]).map((res) => (
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
                    {([24, 30, 60] as ExportFrameRateOption[]).map((fps) => (
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
    );
};
