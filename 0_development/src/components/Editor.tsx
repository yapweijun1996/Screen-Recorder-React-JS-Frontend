import React, { useState, useRef, useEffect } from 'react';
import { ExportFormat, ExportFrameRateOption, ExportResolution, VideoMetadata, VideoQualityPreset, VIDEO_QUALITY_PRESETS } from '../types';
import { formatTime, generateFileName, formatBytes } from '../utils/format';
import { EditorHeader } from './editor/EditorHeader';
import { EditorPlayer } from './editor/EditorPlayer';
import { EditorTrimPanel } from './editor/EditorTrimPanel';
import { EditorExportPanel } from './editor/EditorExportPanel';
import { ffmpegService } from '../services/ffmpegService';
import { useI18n } from '../i18n';
import { useEditorExportController } from './editor/useEditorExportController';
import { useSegmentsEditor } from './editor/useSegmentsEditor';
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
    const applyHighQualityPreset = () => { setSelectedQuality('high'); setSelectedResolution('original'); setSelectedFormat('mp4'); setSelectedFps(60); setCustomCrf(20); };
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

                // 若使用者還沒開始剪輯，且瀏覽器 metadata 比 recordedDuration 更準，更新初始片段
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

    return (
        <div className="w-full flex-1 flex flex-col px-4 sm:px-6 py-4 sm:py-6 animate-fade-in min-h-0">
            <div className="mx-auto w-full max-w-7xl flex-1 flex flex-col gap-5 min-h-0">
                <EditorHeader onReset={onReset} />

                {/* 上：预览（左）+ 设置/导出（右） */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
                    <section className="lg:col-span-8 xl:col-span-9 min-h-0">
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
                                videoRef.current.currentTime = time; setCurrentTime(time);
                            }}
                        />
                    </section>

                    <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20">
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
                            exportError={exportError}
                            playbackError={playbackError}
                            onApplyHighQualityPreset={applyHighQualityPreset}
                            onExportTrimmed={exportTrimmed}
                            onExportFull={exportFull}
                            onClearExportUrl={clearExportUrl}
                            onClearExportError={clearExportError}
                            downloadFileName={generateFileName('screen-recording', selectedFormat)}
                        />
                    </aside>
                </div>

                {/* 下：时间轴/剪辑（更接近视频编辑器布局） */}
                <section className="min-h-0">
                    <EditorTrimPanel
                        playbackError={playbackError}
                        maxDuration={maxDuration}
                        segments={safeSegments}
                        selectedIndex={selectedIndex}
                        currentTime={currentTime}
                        start={selectedSegment.start}
                        end={selectedSegment.end}
                        startLabel={formatTime(selectedSegment.start)}
                        endLabel={formatTime(selectedSegment.end)}
                        totalSelectedLabel={formatTime(totalSelectedDuration)}
                        canUndo={canUndo}
                        onSelectIndex={(idx) => {
                            selectIndex(idx);
                            if (videoRef.current) {
                                videoRef.current.currentTime = safeSegments[Math.min(idx, safeSegments.length - 1)].start;
                            }
                        }}
                        onChange={updateSelectedSegment}
                        onPreviewRequest={handleSeek}
                        onPreviewEdited={previewEditedResult}
                        onSplitAtPlayhead={() => splitSelectedAt(currentTime)}
                        onDeleteSelected={deleteSelectedSegment}
                        onRemoveRange={(s, e) => { setPreviewIndex(null); removeInterval(s, e); }}
                        onUndo={undo}
                        onResetTrim={() => {
                            resetSegments();
                            if (videoRef.current) videoRef.current.currentTime = 0;
                        }}
                    />
                </section>
            </div>
        </div>
    );
};
