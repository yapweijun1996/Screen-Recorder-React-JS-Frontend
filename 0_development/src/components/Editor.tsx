import React, { useState, useRef, useEffect } from 'react';
import { VideoMetadata, TrimRange, VideoQualityPreset, VIDEO_QUALITY_PRESETS, ExportOptions } from '../types';
import { formatTime, generateFileName, formatBytes } from '../utils/format';
import { RangeSlider } from './RangeSlider';
import { Button } from './Button';
import { ffmpegService } from '../services/ffmpegService';
import { Play, Scissors, Download, RotateCcw, FileVideo, Loader2, Settings, ChevronDown, Zap, Sparkles, Crown, Film } from 'lucide-react';

interface EditorProps {
    videoMetadata: VideoMetadata;
    onReset: () => void;
}

type Resolution = 'original' | '720p' | '1080p' | '4k';
type ExportFormat = 'mp4' | 'webm';

export const Editor: React.FC<EditorProps> = ({ videoMetadata, onReset }) => {
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

    // Export Configuration State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [selectedQuality, setSelectedQuality] = useState<VideoQualityPreset>('medium');
    const [selectedResolution, setSelectedResolution] = useState<Resolution>('original');
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');

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
            setPlaybackError('Recording duration could not be determined. Please record again.');
        }
    }, [videoMetadata]);

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
                    setPlaybackError('Recording duration is zero. Please record again.');
                } else {
                    setPlaybackError(null);
                }
            } else {
                setPlaybackError('Could not read recording duration. Please record again.');
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

    const handleExport = async (mode: 'full' | 'trimmed') => {
        if (playbackError || videoMetadata.duration <= 0) {
            setPlaybackError('Cannot export: recording is empty or corrupted.');
            return;
        }

        if (mode === 'trimmed' && range.end - range.start <= 0) {
            setPlaybackError('Please select a trim range greater than zero.');
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
            alert('Failed to export video. Please check console.');
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

    const qualityIcons: Record<VideoQualityPreset, React.ReactNode> = {
        low: <Zap size={14} />,
        medium: <Film size={14} />,
        high: <Sparkles size={14} />,
        lossless: <Crown size={14} />
    };

    return (
        <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-4 md:p-6 gap-6 animate-fade-in">
            {/* Top Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FileVideo className="text-indigo-400" />
                    Edit & Export
                </h2>
                <Button variant="ghost" onClick={onReset}>
                    <RotateCcw size={16} />
                    Record New
                </Button>
            </div>

            {/* Main Video Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Video Player */}
                <div className="lg:col-span-2 space-y-4">
                    {playbackError && (
                        <div className="p-4 bg-red-900/30 border border-red-500/40 rounded-lg text-red-100 text-sm">
                            {playbackError}
                        </div>
                    )}
                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-slate-700 group">
                        <video
                            ref={videoRef}
                            src={videoMetadata.url}
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onClick={togglePlay}
                            preload="metadata"
                            controls={!!playbackError}
                            aria-disabled={!!playbackError}
                        />
                        {/* Center Play Button Overlay */}
                        {!isPlaying && !playbackError && (
                            <div
                                className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors"
                                onClick={togglePlay}
                            >
                                <div className="p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl hover:scale-105 transition-transform">
                                    <Play size={40} className="fill-white text-white translate-x-1" />
                                </div>
                            </div>
                        )}

                        {/* Timeline Progress */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-100"
                                style={{ width: `${(currentTime / maxDuration) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Controls Bar */}
                    <div className="flex items-center justify-between text-slate-400 text-sm px-1">
                        <div className="flex items-center gap-2 font-mono">
                            <span className="text-indigo-400">{formatTime(currentTime)}</span>
                            <span>/</span>
                            <span>{formatTime(range.end)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span>Total: {formatTime(maxDuration)}</span>
                            <span className="text-slate-600">|</span>
                            <span>Size: {formatBytes(videoMetadata.blob.size)}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Controls & Actions */}
                <div className="flex flex-col gap-4 bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 max-h-[600px] overflow-y-auto">

                    {/* Trimming UI */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Scissors size={18} className="text-indigo-400" />
                            <h3 className="font-semibold text-slate-200">Trim Video</h3>
                        </div>

                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                            <RangeSlider
                                min={0}
                                max={maxDuration || 100}
                                start={range.start}
                                end={range.end}
                                onChange={(s, e) => !playbackError && setRange({ start: s, end: e })}
                                onPreviewRequest={playbackError ? undefined : handleSeek}
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono">
                                <span>Start: {formatTime(range.start)}</span>
                                <span className="text-indigo-400">Duration: {formatTime(trimmedDuration)}</span>
                                <span>End: {formatTime(range.end)}</span>
                            </div>
                        </div>

                        <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled={!!playbackError}
                            onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = range.start;
                                    videoRef.current.play();
                                }
                            }}
                        >
                            <Play size={14} /> Preview Selection
                        </Button>
                    </div>

                    <div className="h-px bg-slate-700/50" />

                    {/* Quality Configuration */}
                    <div className="space-y-3">
                        <button
                            className="w-full flex items-center justify-between text-slate-200 hover:text-white transition-colors"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            <div className="flex items-center gap-2">
                                <Settings size={18} className="text-purple-400" />
                                <h3 className="font-semibold">Export Settings</h3>
                            </div>
                            <ChevronDown size={18} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>

                        {showAdvanced && (
                            <div className="space-y-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 animate-fade-in">
                                {/* Quality Preset */}
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400 uppercase tracking-wide">Quality</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((preset) => {
                                            const config = VIDEO_QUALITY_PRESETS[preset];
                                            return (
                                                <button
                                                    key={preset}
                                                    onClick={() => setSelectedQuality(preset)}
                                                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${selectedQuality === preset
                                                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                                                            : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                                        }`}
                                                >
                                                    {qualityIcons[preset]}
                                                    <div>
                                                        <div className="text-sm font-medium">{config.label}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-slate-500">{VIDEO_QUALITY_PRESETS[selectedQuality].description}</p>
                                </div>

                                {/* Resolution */}
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400 uppercase tracking-wide">Resolution</label>
                                    <div className="flex gap-2">
                                        {(['original', '720p', '1080p', '4k'] as Resolution[]).map((res) => (
                                            <button
                                                key={res}
                                                onClick={() => setSelectedResolution(res)}
                                                className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${selectedResolution === res
                                                        ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                                                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                {res === 'original' ? 'Original' : res}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Format */}
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-400 uppercase tracking-wide">Format</label>
                                    <div className="flex gap-2">
                                        {(['mp4', 'webm'] as ExportFormat[]).map((fmt) => (
                                            <button
                                                key={fmt}
                                                onClick={() => setSelectedFormat(fmt)}
                                                className={`flex-1 py-2 px-3 rounded-lg border text-sm uppercase transition-all ${selectedFormat === fmt
                                                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                                                    }`}
                                            >
                                                {fmt}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Estimated Size */}
                                <div className="flex justify-between text-sm text-slate-400 pt-2 border-t border-slate-700/50">
                                    <span>Estimated size:</span>
                                    <span className="text-indigo-400 font-medium">{estimatedSize}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-slate-700/50" />

                    {/* Export Actions */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-slate-200">Export</h3>

                        {isProcessing && (
                            <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-lg space-y-3 animate-fade-in">
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <Loader2 size={18} className="animate-spin" />
                                    <span className="text-sm font-medium">Processing video...</span>
                                </div>
                                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                        style={{ width: `${processingProgress}%` }}
                                    />
                                </div>
                                <div className="text-xs text-slate-400 flex justify-between">
                                    <span>{processingProgress}% complete</span>
                                    <span>ETA: {processingEta ?? 'estimating...'}</span>
                                </div>
                            </div>
                        )}

                        {exportUrl ? (
                            <div className="bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-lg text-center space-y-3 animate-fade-in">
                                <p className="text-emerald-400 text-sm font-medium">Video processed successfully!</p>
                                <a
                                    href={exportUrl}
                                    download={generateFileName('screen-recording', selectedFormat)}
                                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
                                >
                                    <Download size={20} />
                                    Download {selectedFormat.toUpperCase()}
                                </a>
                                <button
                                    onClick={() => setExportUrl(null)}
                                    className="text-slate-400 text-xs hover:text-white underline"
                                >
                                    Export another version
                                </button>
                            </div>
                        ) : !isProcessing && (
                            <div className="space-y-2">
                                <Button
                                    variant="primary"
                                    className="w-full py-3"
                                    onClick={() => handleExport('trimmed')}
                                    isLoading={isProcessing}
                                    disabled={!!playbackError || isProcessing}
                                >
                                    <Scissors size={16} />
                                    Export Trimmed ({VIDEO_QUALITY_PRESETS[selectedQuality].label})
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-xs text-slate-400"
                                    onClick={() => handleExport('full')}
                                    disabled={!!playbackError || isProcessing}
                                >
                                    Export Full Video (No Trim)
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
