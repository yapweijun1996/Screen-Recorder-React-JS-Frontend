import React from 'react';
import { Button } from '../Button';
import { Gauge, Mic, MicOff, Camera, CameraOff, GripVertical, Disc } from 'lucide-react';
import { PIPPosition, RecordingQuality } from '../../types';
import { useI18n } from '../../i18n';

interface QualityOption {
    key: RecordingQuality;
    label: string;
    detail: string;
}

interface RecorderSidebarProps {
    enableMic: boolean;
    onToggleMic: () => void;

    enableCam: boolean;
    onToggleCam: () => void;

    pipPosition: PIPPosition;
    onCyclePipPosition: () => void;

    recordingQuality: RecordingQuality;
    onSelectQuality: (q: RecordingQuality) => void;

    customFps: number;
    onChangeCustomFps: (fps: number) => void;

    customBitrateMbps: number;
    onChangeCustomBitrateMbps: (mbps: number) => void;

    onStartRecording: () => void;
    isPreparing: boolean;
    isRecording: boolean;
}

export const RecorderSidebar: React.FC<RecorderSidebarProps> = ({
    enableMic,
    onToggleMic,
    enableCam,
    onToggleCam,
    pipPosition,
    onCyclePipPosition,
    recordingQuality,
    onSelectQuality,
    customFps,
    onChangeCustomFps,
    customBitrateMbps,
    onChangeCustomBitrateMbps,
    onStartRecording,
    isPreparing,
    isRecording,
}) => {
    const { t } = useI18n();

    const qualityOptions: QualityOption[] = [
        { key: 'standard', label: t('recorder.quality.standard.label'), detail: t('recorder.quality.standard.detail') },
        { key: 'high', label: t('recorder.quality.high.label'), detail: t('recorder.quality.high.detail') },
        { key: 'ultra', label: t('recorder.quality.ultra.label'), detail: t('recorder.quality.ultra.detail') },
        { key: 'custom', label: t('recorder.quality.custom.label'), detail: t('recorder.quality.custom.detail', { fps: customFps, bitrate: customBitrateMbps }) },
    ];

    const pipPositionLabelKey = `recorder.sources.cam.pos.${pipPosition}`;
    const pipPositionLabel = t(pipPositionLabelKey) !== pipPositionLabelKey
        ? t(pipPositionLabelKey)
        : pipPosition.replace('-', ' ');

    return (
        <aside className="lg:col-span-4 xl:col-span-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur">
                {/* Header */}
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-indigo-600/15 border border-indigo-500/30">
                            <Gauge size={18} className="text-indigo-300" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-white leading-tight">{t('recorder.sidebar.title')}</div>
                            <div className="text-xs text-slate-400 leading-tight">{t('recorder.sidebar.subtitle')}</div>
                        </div>
                    </div>
                </div>

                {/* Sources */}
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{t('recorder.sources.title')}</span>
                        <span className="text-[11px] text-slate-500">{t('recorder.sources.hint')}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                        <button
                            onClick={onToggleMic}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${enableMic
                                    ? 'bg-indigo-600/15 border-indigo-500/60 text-indigo-100'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                }`}
                        >
                            <div className={`mt-0.5 ${enableMic ? 'text-indigo-300' : 'text-slate-400'}`}>
                                {enableMic ? <Mic size={16} /> : <MicOff size={16} />}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-sm font-semibold leading-tight">{t('recorder.sources.mic.title')}</div>
                                <div className="text-[11px] text-slate-500">{enableMic ? t('recorder.sources.mic.on') : t('recorder.sources.mic.off')}</div>
                            </div>
                        </button>

                        <button
                            onClick={onToggleCam}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${enableCam
                                    ? 'bg-purple-600/15 border-purple-500/60 text-purple-100'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                }`}
                        >
                            <div className={`mt-0.5 ${enableCam ? 'text-purple-300' : 'text-slate-400'}`}>
                                {enableCam ? <Camera size={16} /> : <CameraOff size={16} />}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-sm font-semibold leading-tight">{t('recorder.sources.cam.title')}</div>
                                <div className="text-[11px] text-slate-500">{enableCam ? t('recorder.sources.cam.on') : t('recorder.sources.cam.off')}</div>
                            </div>
                        </button>
                    </div>

                    {enableCam && (
                        <div className="mt-1 flex items-center justify-between gap-2 bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
                            <span className="text-xs text-slate-400">{t('recorder.sources.cam.position')}</span>
                            <button
                                onClick={onCyclePipPosition}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-700 transition-colors text-xs"
                                title={t('recorder.sources.cam.tooltip')}
                            >
                                <GripVertical size={14} />
                                <span className="text-xs capitalize">{pipPositionLabel}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="h-px bg-slate-800" />

                {/* Quality */}
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{t('recorder.quality.title')}</span>
                        <span className="text-[11px] text-slate-500">{t('recorder.quality.subtitle')}</span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                        {qualityOptions.map((q) => (
                            <button
                                key={q.key}
                                onClick={() => onSelectQuality(q.key)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all duration-200 ${recordingQuality === q.key
                                        ? 'bg-emerald-600/15 border-emerald-500/70 text-emerald-100'
                                        : 'bg-slate-800/50 border-slate-700 text-slate-200 hover:border-slate-600'
                                    }`}
                            >
                                <div className="font-semibold text-sm leading-tight">{q.label}</div>
                                <div className="text-[11px] text-slate-400 leading-tight">{q.detail}</div>
                            </button>
                        ))}
                    </div>

                    {recordingQuality === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                {t('recorder.custom.fps')}
                                <input
                                    type="number"
                                    min={15}
                                    max={120}
                                    value={customFps}
                                    onChange={(e) => onChangeCustomFps(Number(e.target.value) || 0)}
                                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-300">
                                {t('recorder.custom.mbps')}
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    step={0.5}
                                    value={customBitrateMbps}
                                    onChange={(e) => onChangeCustomBitrateMbps(Number(e.target.value) || 0)}
                                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* CTA */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/70">
                    <Button
                        onClick={onStartRecording}
                        disabled={isPreparing || isRecording}
                        size="lg"
                        className="w-full h-12 text-base shadow-[0_0_25px_rgba(79,70,229,0.25)] hover:shadow-[0_0_40px_rgba(79,70,229,0.35)] transition-all"
                    >
                        {isPreparing ? (
                            <span className="flex items-center gap-2">
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('recorder.cta.initializing')}
                            </span>
                        ) : (
                            <>
                                <Disc className="w-5 h-5 fill-current" />
                                {t('recorder.cta.start')}
                            </>
                        )}
                    </Button>
                    <div className="mt-2 text-[11px] text-slate-500 leading-snug">
                        {t('recorder.tip')}
                    </div>
                </div>
            </div>
        </aside>
    );
};
