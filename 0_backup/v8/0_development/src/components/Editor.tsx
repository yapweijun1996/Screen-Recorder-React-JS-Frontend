import React, { useState, useRef, useEffect } from 'react';
import { ExportFormat, ExportFrameRateOption, ExportResolution, VideoMetadata, VideoQualityPreset, VIDEO_QUALITY_PRESETS } from '../types';
import { formatTime, generateFileName, formatBytes } from '../utils/format';
import { EditorHeader } from './editor/EditorHeader';
import { EditorPlayer } from './editor/EditorPlayer';
import { EditorLayout } from './editor/EditorLayout';
import { LibraryPanel } from './editor/LibraryPanel';
import { InspectorPanel } from './editor/InspectorPanel';
import { ProTimeline } from './editor/ProTimeline';
import { ffmpegService } from '../services/ffmpegService';
import { useI18n } from '../i18n';
import { useEditorExportController } from './editor/useEditorExportController';
import { useSegmentsEditor } from './editor/useSegmentsEditor';
import { useKeyboardShortcuts } from './editor/useKeyboardShortcuts';

interface EditorProps {
    videoMetadata: VideoMetadata;
    onReset: () => void;
}

export const Editor: React.FC<EditorProps> = ({ videoMetadata, onReset }) => {
    const { t } = useI18n();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Export Configuration State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [selectedQuality, setSelectedQuality] = useState<VideoQualityPreset>('medium');
    const [selectedResolution, setSelectedResolution] = useState<ExportResolution>('original');
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');
    const [selectedFps, setSelectedFps] = useState<ExportFrameRateOption>(30);
    const [customCrf, setCustomCrf] = useState<number>(VIDEO_QUALITY_PRESETS['medium'].crf);

    const applyHighQualityPreset = () => {
        setSelectedQuality('high');
        setSelectedResolution('original');
        setSelectedFormat('mp4');
        setSelectedFps(60);
        setCustomCrf(20);
    };

    // Track fullscreen changes
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    useEffect(() => {
        if (!Number.isFinite(videoMetadata.duration) || videoMetadata.duration <= 0) {
            setPlaybackError(t('editor.playback.durationUnknown'));
        }
    }, [videoMetadata, t]);

    // Reset CRF when quality preset changes
    useEffect(() => {
        setCustomCrf(VIDEO_QUALITY_PRESETS[selectedQuality].crf);
    }, [selectedQuality]);

    const getSafeDuration = () => {
        const vidDur = videoRef.current?.duration;
        if (vidDur && Number.isFinite(vidDur)) return vidDur;
        return videoMetadata.duration;
    };

    const maxDuration = Math.max(getSafeDuration(), 1);

    const {
        safeSegments,
        selectedSegment,
        activeSegment,
        selectedIndex,
        previewIndex,
        totalSelectedDuration,
        canUndo,
        setPreviewIndex,
        selectIndex,
        setSelectedIndexDirect,
        updateSelectedSegment,
        splitSelectedAt,
        deleteSelectedSegment,
        removeInterval,
        undo,
        resetSegments,
        syncDurationIfUntouched,
    } = useSegmentsEditor({
        initialDuration: videoMetadata.duration,
        maxDuration,
    });

    const {
        isProcessing,
        processingProgress,
        processingEta,
        exportUrl,
        exportError,
        exportTrimmed,
        exportFull,
        clearExportUrl,
        clearExportError,
    } = useEditorExportController({
        videoMetadata,
        segments: safeSegments,
        selectedQuality,
        selectedResolution,
        selectedFormat,
        selectedFps,
        customCrf,
        playbackError,
        setPlaybackError,
        t,
    });

    const estimatedSize = ffmpegService.estimateFileSize(totalSelectedDuration, selectedQuality);

    // Final Cut Pro 风格键盘快捷键
    useKeyboardShortcuts({
        videoRef,
        isPlaying,
        onTogglePlay: () => {
            if (!videoRef.current || playbackError) return;
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        },
        onSeek: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
                setCurrentTime(time);
            }
        },
        onSplitAtPlayhead: () => splitSelectedAt(currentTime),
        onUndo: undo,
        onDeleteSelected: deleteSelectedSegment,
        maxDuration,
        segmentStart: selectedSegment.start,
        segmentEnd: selectedSegment.end,
    });

    // Sync Video Time
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const curr = videoRef.current.currentTime;
            setCurrentTime(curr);

            // 預覽剪輯結果：依序跳到下一段
            if (previewIndex !== null) {
                const seg = safeSegments[previewIndex];
                if (seg && curr >= seg.end) {
                    const next = previewIndex + 1;
                    if (next < safeSegments.length) {
                        setPreviewIndex(next);
                        setSelectedIndexDirect(next);
                        videoRef.current.currentTime = safeSegments[next].start;
                    } else {
                        setPreviewIndex(null);
                        videoRef.current.pause();
                        setIsPlaying(false);
                    }
                }
                return;
            }

            // 一般預覽：只在「目前選到的片段」內循環
            if (curr >= selectedSegment.end) {
                videoRef.current.currentTime = selectedSegment.start;
            }
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur) && dur !== Infinity && !isNaN(dur)) {
                if (dur <= 0) {
                    setPlaybackError(t('editor.playback.durationZero'));
                } else {
                    setPlaybackError(null);
                }
                syncDurationIfUntouched(dur);
            } else {
                setPlaybackError(t('editor.playback.readError'));
            }
        }
    };

    const togglePlay = () => {
        if (!videoRef.current || playbackError) return;
        if (isPlaying) {
            videoRef.current.pause();
            setPreviewIndex(null);
        } else {
            if (videoRef.current.currentTime >= selectedSegment.end) {
                videoRef.current.currentTime = selectedSegment.start;
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

    const previewEditedResult = () => {
        if (playbackError || !videoRef.current || safeSegments.length === 0) return;
        setPreviewIndex(0);
        setSelectedIndexDirect(0);
        videoRef.current.currentTime = safeSegments[0].start;
        videoRef.current.play().catch(() => undefined);
    };

    const segmentProgressPercent = (() => {
        const seg = activeSegment;
        const denom = Math.max(seg.end - seg.start, 0.0001);
        const pct = ((currentTime - seg.start) / denom) * 100;
        return Math.min(100, Math.max(0, pct));
    })();

    // 视频信息
    const videoInfo = {
        name: 'Screen Recording',
        duration: maxDuration,
        size: videoMetadata.blob.size,
        url: videoMetadata.url,
    };

    return (
        <div className="w-full flex-1 flex flex-col animate-fade-in min-h-0">
            {/* 顶部标题栏 - 全宽 */}
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                <EditorHeader onReset={onReset} />
            </div>

            {/* Final Cut Pro 风格布局 */}
            <EditorLayout
                /* 左侧素材库 */
                libraryPanel={
                    <LibraryPanel
                        videoInfo={videoInfo}
                        segmentCount={safeSegments.length}
                        totalSelectedDuration={totalSelectedDuration}
                    />
                }

                /* 中央播放器 */
                viewerPanel={
                    <EditorPlayer
                        videoRef={videoRef}
                        src={videoMetadata.url}
                        playbackError={playbackError}
                        isPlaying={isPlaying}
                        isFullscreen={isFullscreen}
                        currentTimeLabel={formatTime(currentTime)}
                        endTimeLabel={formatTime(activeSegment.end)}
                        totalTimeLabel={formatTime(maxDuration)}
                        sizeLabel={formatBytes(videoMetadata.blob.size)}
                        progressPercent={segmentProgressPercent}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => {
                            setIsPlaying(false);
                            setPreviewIndex(null);
                        }}
                        onTogglePlay={togglePlay}
                        onToggleFullscreen={toggleFullscreen}
                        onSeekPercent={(p01) => {
                            if (!videoRef.current || playbackError) return;
                            setPreviewIndex(null);
                            const time = activeSegment.start + (Math.max(activeSegment.end - activeSegment.start, 0) * p01);
                            videoRef.current.currentTime = time;
                            setCurrentTime(time);
                        }}
                    />
                }

                /* 右侧检查器/导出 */
                inspectorPanel={
                    <InspectorPanel
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
                        exportError={exportError}
                        playbackError={playbackError}
                        onApplyHighQualityPreset={applyHighQualityPreset}
                        onExportTrimmed={exportTrimmed}
                        onExportFull={exportFull}
                        onClearExportUrl={clearExportUrl}
                        onClearExportError={clearExportError}
                        downloadFileName={generateFileName('screen-recording', selectedFormat)}
                    />
                }

                /* 底部时间轴 */
                timelinePanel={
                    <ProTimeline
                        maxDuration={maxDuration}
                        segments={safeSegments}
                        selectedIndex={selectedIndex}
                        currentTime={currentTime}
                        totalSelectedDuration={totalSelectedDuration}
                        canUndo={canUndo}
                        canDelete={safeSegments.length > 1}
                        onSelectSegment={(idx) => {
                            selectIndex(idx);
                            if (videoRef.current) {
                                videoRef.current.currentTime = safeSegments[Math.min(idx, safeSegments.length - 1)].start;
                            }
                        }}
                        onSeek={handleSeek}
                        onSplitAt={(time) => splitSelectedAt(time)}
                        onDeleteSelected={deleteSelectedSegment}
                        onUndo={undo}
                        onPreviewEdited={previewEditedResult}
                        onResetTrim={() => {
                            resetSegments();
                            if (videoRef.current) videoRef.current.currentTime = 0;
                        }}
                        skimmingEnabled={!isPlaying}
                    />
                }
            />
        </div>
    );
};
