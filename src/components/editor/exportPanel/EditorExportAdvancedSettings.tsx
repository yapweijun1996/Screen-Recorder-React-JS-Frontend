import React, { useEffect, useState } from 'react';
import { Zap, Sparkles, Crown, Film } from 'lucide-react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../../types';
import { VIDEO_QUALITY_PRESETS } from '../../../types';
import { useI18n } from '../../../i18n';
import { exportService } from '../../../services/exportService';
import { getCachedSupport, type WebCodecsSupport } from '../../../services/webcodecs/capability';
import { getExportFormatAvailability } from '../../../services/webcodecs/formatDecision';

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
    isProcessing,
}) => {
    const { t } = useI18n();
    const isAudioOnly = selectedFormat === 'audio';
    const [support, setSupport] = useState<WebCodecsSupport | null>(() => getCachedSupport());

    useEffect(() => {
        let active = true;
        exportService.init().then(() => {
            if (active) setSupport(getCachedSupport());
        }).catch(() => {
            if (active) setSupport(getCachedSupport());
        });
        return () => { active = false; };
    }, []);

    const availability = support ? getExportFormatAvailability(support) : null;
    const availableFormats = availability
        ? [availability.mp4 && 'MP4', availability.webm && 'WebM', availability.audio && 'Audio'].filter(Boolean).join(' · ') || t('engine.error')
        : t('engine.loading');
    const audioNote = support && (!support.h264 || !support.aac)
        ? t('converter.fallback.notice')
        : null;

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Quality Preset */}
            <div className="space-y-2">
                <label className="text-xs text-th-tertiary uppercase tracking-wide">{t('editor.export.quality')}</label>
                <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((preset) => (
                        <button
                            key={preset}
                            onClick={() => onSelectQuality(preset)}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${selectedQuality === preset
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-200'
                                : 'bg-th-card/50 border-th-divider text-th-secondary hover:border-th-divider'
                                }`}
                            disabled={isProcessing}
                            type="button"
                        >
                            {qualityIcons[preset]}
                            <div className="text-sm font-medium leading-tight">{t(`quality.${preset}.label`)}</div>
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-th-tertiary">{t(`quality.${selectedQuality}.description`)}</p>
            </div>

            {/* Resolution */}
            <div className="space-y-2">
                <label className="text-xs text-th-tertiary uppercase tracking-wide">{t('editor.export.resolution')}</label>
                <div className="grid grid-cols-2 gap-2">
                    {(['original', '720p', '1080p', '4k'] as ExportResolution[]).map((res) => (
                        <button
                            key={res}
                            onClick={() => onSelectResolution(res)}
                            className={`py-2 px-3 rounded-xl border text-sm transition-all ${selectedResolution === res
                                ? 'bg-purple-600/20 border-purple-500 text-purple-700 dark:text-purple-200'
                                : 'bg-th-card/50 border-th-divider text-th-secondary hover:border-th-divider'
                                }`}
                            disabled={isProcessing || isAudioOnly}
                            type="button"
                        >
                            {res === 'original' ? t('editor.export.resolutionOriginal') : res}
                        </button>
                    ))}
                </div>
                <p role="status" className="text-[11px] text-th-tertiary">
                    {t('editor.export.format')}: {availableFormats}
                </p>
                {audioNote && <p className="text-[11px] text-amber-600 dark:text-amber-300">{audioNote}</p>}
            </div>

            {/* FPS */}
            <div className="space-y-2">
                <label className="text-xs text-th-tertiary uppercase tracking-wide">{t('editor.export.frameRate')}</label>
                <div className="grid grid-cols-3 gap-2">
                    {([24, 30, 60] as ExportFrameRateOption[]).map((fps) => (
                        <button
                            key={fps}
                            onClick={() => onSelectFps(fps)}
                            className={`py-2 px-3 rounded-xl border text-sm transition-all ${selectedFps === fps
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-200'
                                : 'bg-th-card/50 border-th-divider text-th-secondary hover:border-th-divider'
                                }`}
                            disabled={isProcessing || isAudioOnly}
                            type="button"
                        >
                            {fps}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-th-tertiary">{t('editor.export.frameRateHint')}</p>
            </div>

                {/* Format */}
                <div className="space-y-2">
                    <label className="text-xs text-th-tertiary uppercase tracking-wide">{t('editor.export.format')}</label>
                    <div className="grid grid-cols-2 gap-2">
                    {(['mp4', 'webm', 'audio'] as ExportFormat[]).map((fmt) => (
                        <button
                            key={fmt}
                            onClick={() => onSelectFormat(fmt)}
                            className={`py-2 px-3 rounded-xl border text-sm uppercase transition-all ${selectedFormat === fmt
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-700 dark:text-emerald-200'
                                : 'bg-th-card/50 border-th-divider text-th-secondary hover:border-th-divider'
                                }`}
                            disabled={isProcessing}
                            type="button"
                        >
                            {fmt.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
