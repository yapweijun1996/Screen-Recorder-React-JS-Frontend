import React from 'react';
import { Maximize, Minimize, Pause, Play } from 'lucide-react';
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
        <div className="h-full flex flex-col min-h-0">
            {playbackError && (
                <div className="flex-shrink-0 p-3 bg-red-900/30 border border-red-500/40 rounded-lg text-red-100 text-sm mb-2">
                    {playbackError}
                </div>
            )}

            <div className="flex-1 min-h-0 bg-th-deep/60 border border-th-edge rounded-xl overflow-hidden shadow-2xl flex flex-col">
                <div className="relative flex-1 min-h-0 bg-black group">
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

                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-th-card">
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

                <div className="flex-shrink-0 px-3 py-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-th-surface text-th-secondary text-xs border-t border-th-edge">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onTogglePlay}
                            disabled={!!playbackError}
                            aria-label={isPlaying ? t('preview.pause') : t('editor.timeline.play')}
                            title={isPlaying ? t('preview.pause') : t('editor.timeline.play')}
                            className="flex items-center justify-center w-11 h-11 rounded-md text-th-primary hover:bg-th-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
                        </button>
                        <div className="flex items-center gap-2 font-mono">
                            <span className="font-semibold text-th-primary">{currentTimeLabel}</span>
                            <span>/</span>
                            <span>{endTimeLabel}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{t('editor.player.total')}: {totalTimeLabel}</span>
                        <span className="text-th-faint">|</span>
                        <span>{t('editor.player.size')}: {sizeLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
