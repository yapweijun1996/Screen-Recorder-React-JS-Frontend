import React, { useState, useRef, useEffect } from 'react';
import { VideoMetadata, TrimRange, VideoQualityPreset, VIDEO_QUALITY_PRESETS, ExportOptions } from '../types';
import { formatTime, generateFileName, formatBytes } from '../utils/format';
import { EditorHeader } from './editor/EditorHeader';
import { EditorPlayer } from './editor/EditorPlayer';
import { EditorTrimPanel } from './editor/EditorTrimPanel';
import { EditorExportPanel } from './editor/EditorExportPanel';
import { ffmpegService } from '../services/ffmpegService';
import { useI18n } from '../i18n';
interface EditorProps {
    videoMetadata: VideoMetadata;
    onReset: () => void;
}
type Resolution = 'original' | '720p' | '1080p' | '4k'; type ExportFormat = 'mp4' | 'webm'; type FrameRate = 24 | 30 | 60;

export const Editor: React.FC<EditorProps> = ({ videoMetadata, onReset }) => {
    const { t } = useI18n();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [range, setRange] = useState<TrimRange>({ start: 0, end: videoMetadata.duration });

    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingEta, setProcessingEta] = useState<string | null>(null);
    const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
    const [exportUrl, setExportUrl] = useState<string | null>(null);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Export Configuration State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [selectedQuality, setSelectedQuality] = useState<VideoQualityPreset>('medium');
    const [selectedResolution, setSelectedResolution] = useState<Resolution>('original');
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');
    const [selectedFps, setSelectedFps] = useState<FrameRate>(30);
    const [customCrf, setCustomCrf] = useState<number>(VIDEO_QUALITY_PRESETS['medium'].crf);
    const applyHighQualityPreset = () => {
        setSelectedQuality('high');
        setSelectedResolution('original');
        setSelectedFormat('mp4');
        setSelectedFps(60);
        setCustomCrf(20);
    };

    // Subscribe to FFmpeg progress
    useEffect(() => {
        ffmpegService.onProgress(({ ratio }) => {
            const clamped = Math.max(0, Math.min(1, ratio));
            setProcessingProgress(Math.round(clamped * 100));

            if (processingStartTime && clamped > 0) {
                const elapsedMs = Date.now() - processingStartTime;
                const etaMs = (elapsedMs / clamped) - elapsedMs;
                if (Number.isFinite(etaMs) && etaMs >= 0) {
                    setProcessingEta(formatEta(etaMs));
                }
            }
        });
    }, [processingStartTime]);

    // Track fullscreen changes
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Revoke generated blob URLs when component unmounts or new exports are created
    useEffect(() => {
        return () => {
            if (exportUrl) {
                URL.revokeObjectURL(exportUrl);
            }
        };
    }, [exportUrl]);

    // Initialize range when metadata loads
    useEffect(() => {
        if (Number.isFinite(videoMetadata.duration) && videoMetadata.duration > 0) {
            setRange({ start: 0, end: videoMetadata.duration });
        } else {
            setPlaybackError(t('editor.playback.durationUnknown'));
        }
    }, [videoMetadata, t]);

    // Reset CRF when quality preset changes
    useEffect(() => {
        setCustomCrf(VIDEO_QUALITY_PRESETS[selectedQuality].crf);
    }, [selectedQuality]);

    // Sync Video Time
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const curr = videoRef.current.currentTime;
            setCurrentTime(curr);

            if (curr >= range.end) {
                videoRef.current.currentTime = range.start;
            }
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur) && dur !== Infinity && !isNaN(dur)) {
                if (Math.abs(range.end - dur) > 1 || range.end === 0) {
                    setRange({ start: 0, end: dur });
                }
                if (dur <= 0) {
                    setPlaybackError(t('editor.playback.durationZero'));
                } else {
                    setPlaybackError(null);
                }
            } else {
                setPlaybackError(t('editor.playback.readError'));
            }
        }
    };

    const togglePlay = () => {
        if (!videoRef.current || playbackError) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            if (videoRef.current.currentTime >= range.end) {
                videoRef.current.currentTime = range.start;
            }
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const toggleFullscreen = () => {
        const target = videoRef.current;
        if (!target) return;
        if (!document.fullscreenElement) {
            target.requestFullscreen?.().catch((err) => console.warn('Enter fullscreen failed', err));
        } else {
            document.exitFullscreen?.().catch((err) => console.warn('Exit fullscreen failed', err));
        }
    };

    const handleExport = async (mode: 'full' | 'trimmed') => {
        if (playbackError || videoMetadata.duration <= 0) {
            setPlaybackError(t('editor.playback.cannotExport'));
            return;
        }

        if (mode === 'trimmed' && range.end - range.start <= 0) {
            setPlaybackError(t('editor.playback.trimInvalid'));
            return;
        }

        setIsProcessing(true);
        setProcessingProgress(0);
        setProcessingEta(null);
        setProcessingStartTime(Date.now());
        setExportUrl(null);

        try {
            const options: ExportOptions = {
                quality: selectedQuality,
                resolution: selectedResolution,
                format: selectedFormat,
                fps: selectedFps,
                crf: customCrf,
                ...(mode === 'trimmed' && {
                    trimStart: range.start,
                    trimEnd: range.end
                })
            };

            const outputBlob = await ffmpegService.processVideo(videoMetadata.blob, options);
            const url = URL.createObjectURL(outputBlob);
            setExportUrl(url);
        } catch (error) {
            console.error(error);
            alert(t('editor.export.failed'));
        } finally {
            setIsProcessing(false);
            setProcessingProgress(0);
            setProcessingEta(null);
            setProcessingStartTime(null);
        }
    };

    const formatEta = (ms: number) => {
        const totalSeconds = Math.round(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.max(totalSeconds % 60, 0);
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    };

    const getSafeDuration = () => {
        const vidDur = videoRef.current?.duration;
        if (vidDur && Number.isFinite(vidDur)) return vidDur;
        return videoMetadata.duration;
    };

    const maxDuration = Math.max(getSafeDuration(), 1);
    const trimmedDuration = Math.max(range.end - range.start, 0);
    const estimatedSize = ffmpegService.estimateFileSize(trimmedDuration, selectedQuality);

    return (
        <div className="w-full h-full px-4 sm:px-6 py-4 sm:py-6 animate-fade-in">
            <div className="mx-auto w-full max-w-7xl space-y-5">
                <EditorHeader onReset={onReset} />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    {/* Left: Player + Trim */}
                    <section className="lg:col-span-8 xl:col-span-9 space-y-5">
                        <EditorPlayer
                            videoRef={videoRef}
                            src={videoMetadata.url}
                            playbackError={playbackError}
                            isPlaying={isPlaying}
                            isFullscreen={isFullscreen}
                            currentTimeLabel={formatTime(currentTime)}
                            endTimeLabel={formatTime(range.end)}
                            totalTimeLabel={formatTime(maxDuration)}
                            sizeLabel={formatBytes(videoMetadata.blob.size)}
                            progressPercent={(currentTime / maxDuration) * 100}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onTogglePlay={togglePlay}
                            onToggleFullscreen={toggleFullscreen}
                        />

                        <EditorTrimPanel
                            playbackError={playbackError}
                            maxDuration={maxDuration}
                            start={range.start}
                            end={range.end}
                            startLabel={formatTime(range.start)}
                            endLabel={formatTime(range.end)}
                            durationLabel={formatTime(trimmedDuration)}
                            onChange={(start, end) => setRange({ start, end })}
                            onPreviewRequest={handleSeek}
                            onPreviewSelection={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = range.start;
                                    videoRef.current.play();
                                }
                            }}
                            onResetTrim={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = 0;
                                    setRange({ start: 0, end: maxDuration });
                                }
                            }}
                        />
                    </section>

                    <EditorExportPanel
                        showAdvanced={showAdvanced}
                        onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
                        selectedQuality={selectedQuality}
                        onSelectQuality={setSelectedQuality}
                        selectedResolution={selectedResolution}
                        onSelectResolution={setSelectedResolution}
                        selectedFormat={selectedFormat}
                        onSelectFormat={setSelectedFormat}
                        selectedFps={selectedFps}
                        onSelectFps={setSelectedFps}
                        customCrf={customCrf}
                        onChangeCrf={setCustomCrf}
                        estimatedSize={estimatedSize}
                        isProcessing={isProcessing}
                        processingProgress={processingProgress}
                        processingEta={processingEta}
                        exportUrl={exportUrl}
                        playbackError={playbackError}
                        onApplyHighQualityPreset={applyHighQualityPreset}
                        onExportTrimmed={() => handleExport('trimmed')}
                        onExportFull={() => handleExport('full')}
                        onClearExportUrl={() => setExportUrl(null)}
                        downloadFileName={generateFileName('screen-recording', selectedFormat)}
                    />
                </div>
            </div>
        </div>
    );
};
