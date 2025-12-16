import React from 'react';
import { Play, Maximize, Minimize } from 'lucide-react';
import { useI18n } from '../../i18n';

interface EditorPlayerProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    src: string;

    playbackError: string | null;

    isPlaying: boolean;
    isFullscreen: boolean;

    currentTimeLabel: string;
    endTimeLabel: string;
    totalTimeLabel: string;
    sizeLabel: string;

    progressPercent: number;

    onTimeUpdate: () => void;
    onLoadedMetadata: () => void;
    onPlay: () => void;
    onPause: () => void;
    onTogglePlay: () => void;
    onToggleFullscreen: () => void;
    onSeekPercent: (percent01: number) => void;
}

export const EditorPlayer: React.FC<EditorPlayerProps> = ({
    videoRef,
    src,
    playbackError,
    isPlaying,
    isFullscreen,
    currentTimeLabel,
    endTimeLabel,
    totalTimeLabel,
    sizeLabel,
    progressPercent,
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onTogglePlay,
    onToggleFullscreen,
    onSeekPercent,
}) => {
    const { t } = useI18n();

    return (
        <div className="space-y-4">
            {playbackError && (
                <div className="p-4 bg-red-900/30 border border-red-500/40 rounded-xl text-red-100 text-sm">
                    {playbackError}
                </div>
            )}

            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="relative aspect-video bg-black group">
                    <video
                        ref={videoRef as React.RefObject<HTMLVideoElement>}
                        src={src}
                        className="w-full h-full object-contain"
                        onTimeUpdate={onTimeUpdate}
                        onLoadedMetadata={onLoadedMetadata}
                        onPlay={onPlay}
                        onPause={onPause}
                        onClick={onTogglePlay}
                        preload="metadata"
                        controls={!!playbackError}
                        aria-disabled={!!playbackError}
                    />

                    {!playbackError && (
                        <button
                            onClick={onToggleFullscreen}
                            className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/20 transition"
                            title={isFullscreen ? t('editor.player.fullscreen.exit') : t('editor.player.fullscreen.enter')}
                        >
                            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                        </button>
                    )}

                    {!isPlaying && !playbackError && (
                        <div
                            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors"
                            onClick={onTogglePlay}
                        >
                            <div className="p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl hover:scale-105 transition-transform">
                                <Play size={40} className="fill-white text-white translate-x-1" />
                            </div>
                        </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                        <div
                            className="relative h-full"
                            onPointerDown={(e) => {
                                if (playbackError) return;
                                const el = e.currentTarget;
                                const rect = el.getBoundingClientRect();
                                const p = (e.clientX - rect.left) / rect.width;
                                onSeekPercent(Math.min(1, Math.max(0, p)));
                            }}
                            title={t('editor.player.seekHint')}
                        >
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-100"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-slate-400 text-sm">
                    <div className="flex items-center gap-2 font-mono">
                        <span className="text-indigo-400">{currentTimeLabel}</span>
                        <span>/</span>
                        <span>{endTimeLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{t('editor.player.total')}: {totalTimeLabel}</span>
                        <span className="text-slate-700">|</span>
                        <span>{t('editor.player.size')}: {sizeLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
