import React, { useState, useRef, useEffect } from 'react';
import { ExportFormat, VideoMetadata } from '../types';
import { formatTime, generateFileName, formatBytes } from '../utils/format';
import { EditorHeader } from './editor/EditorHeader';
import { EditorPlayer } from './editor/EditorPlayer';
import { EditorLayout } from './editor/EditorLayout';
import { LibraryPanel } from './editor/LibraryPanel';
import { InspectorPanel } from './editor/InspectorPanel';
import { ProTimeline } from './editor/ProTimeline';
import { exportService } from '../services/exportService';
import { useI18n } from '../i18n';
import { useEditorExportController } from './editor/useEditorExportController';
import { useSegmentsEditor } from './editor/useSegmentsEditor';
import { useEditorPlayback } from './editor/useEditorPlayback';
import { ExportProgressModal } from './editor/ExportProgressModal';
import { useEditorDraft } from './editor/EditorDraftContext';
import { EditorDraftAlerts } from './editor/EditorDraftAlerts';
import { TranscriptPanel } from './editor/TranscriptPanel';

interface EditorProps {
    videoMetadata: VideoMetadata;
    onReset: () => void;
}

export const Editor: React.FC<EditorProps> = ({ videoMetadata, onReset }) => {
    const { t } = useI18n();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const {
        currentTime, setCurrentTime, showAdvanced, setShowAdvanced,
        selectedQuality, setSelectedQuality, selectedResolution, setSelectedResolution,
        selectedFormat, setSelectedFormat, selectedFps, setSelectedFps,
        draftBlocked, acknowledgeDraftRecovery, draftSavePending, retryDraftSave,
    } = useEditorDraft();

    const applyHighQualityPreset = () => {
        setSelectedQuality('high');
        setSelectedResolution('original');
        setSelectedFormat('mp4');
        setSelectedFps(60);
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
        maxDuration,
    });

    const handleDeleteSelected = () => {
        if (safeSegments.length <= 1) return;

        const target = safeSegments[selectedIndex === 0 ? 1 : selectedIndex - 1];
        deleteSelectedSegment();
        if (target && videoRef.current) {
            videoRef.current.currentTime = target.start;
            setCurrentTime(target.start);
        }
    };

    const {
        isProcessing,
        processingProgress,
        processingEta,
        exportUrl,
        exportFormat,
        exportError,
        exportDownloadFileName,
        exportTrimmed,
        exportFull,
        exportMp3,
        cancelExport,
        clearExportUrl,
        clearExportError,
    } = useEditorExportController({
        videoMetadata,
        segments: safeSegments,
        selectedQuality,
        selectedResolution,
        selectedFormat,
        selectedFps,
        playbackError,
        setPlaybackError,
        t,
    });

    const estimatedSize = exportService.estimateFileSize(totalSelectedDuration, selectedQuality, selectedFormat);

    const handleSelectFormat = (format: ExportFormat) => {
        setSelectedFormat(format);

        if (format === 'audio') {
            setSelectedResolution('original');
            setSelectedFps(30);
        }
    };

    const { handleTimeUpdate, handleLoadedMetadata, togglePlay, handleSeek, toggleFullscreen, previewEditedResult } = useEditorPlayback({
        videoRef, videoMetadata, isPlaying, setIsPlaying, currentTime,
        setCurrentTime, playbackError, setPlaybackError, safeSegments,
        selectedSegment, previewIndex, setPreviewIndex,
        setSelectedIndexDirect, splitSelectedAt, undo, onDeleteSelected: handleDeleteSelected,
        syncDurationIfUntouched, maxDuration, t
    });

    const exportTrigger = useRef<HTMLElement | null>(null);
    const beginExport = (run: () => void) => {
        const focused = document.activeElement;
        exportTrigger.current = focused instanceof HTMLElement ? focused : null;
        run();
    };

    const handleResetTrim = () => { resetSegments(); acknowledgeDraftRecovery(); handleSeek(0); };
    const handleExportTrimmed = () => draftBlocked ? undefined : beginExport(exportTrimmed);

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
        <div data-editor className="w-full flex-1 flex flex-col animate-fade-in min-h-0">
            <EditorDraftAlerts {...{ draftBlocked, draftSavePending, onReset: handleResetTrim, onRetry: retryDraftSave }} />
            {/* Export progress modal */}
            {isProcessing && (
                <ExportProgressModal
                    progress={processingProgress}
                    eta={processingEta}
                    format={exportFormat}
                    onCancel={cancelExport}
                    returnFocusTo={exportTrigger.current}
                />
            )}

            {/* 顶部标题栏 - 全宽 */}
            <div className="px-4 py-2 border-b border-th-edge bg-th-surface flex-shrink-0">
                <EditorHeader onReset={onReset} />
                <TranscriptPanel onSeek={handleSeek} />
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
                            const time = activeSegment.start + (Math.max(activeSegment.end - activeSegment.start, 0) * p01);
                            handleSeek(time);
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
                        onSelectFormat={handleSelectFormat}
                        selectedFps={selectedFps}
                        onSelectFps={setSelectedFps}
                        estimatedSize={estimatedSize}
                        isProcessing={isProcessing}
                        processingProgress={processingProgress}
                        processingEta={processingEta}
                        exportUrl={exportUrl}
                        exportFormat={exportFormat}
                        exportError={exportError}
                        playbackError={playbackError}
                        onApplyHighQualityPreset={applyHighQualityPreset}
                        onExportTrimmed={handleExportTrimmed}
                        onExportFull={() => beginExport(exportFull)}
                        onExportMp3={() => beginExport(exportMp3)}
                        onClearExportUrl={clearExportUrl}
                        onClearExportError={clearExportError}
                        downloadFileName={exportDownloadFileName}
                        rawDownloadUrl={videoMetadata.url}
                        rawDownloadFileName={generateFileName('screen-recording', 'webm')}
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
                            const segment = safeSegments[Math.min(idx, safeSegments.length - 1)];
                            if (segment) handleSeek(segment.start);
                        }}
                        onSeek={handleSeek}
                        onTrimSegment={(start, end) => {
                            videoRef.current?.pause();
                            setPreviewIndex(null);
                            updateSelectedSegment(start, end);
                            handleSeek(Math.max(start, Math.min(currentTime, end)));
                        }}
                        onSplitAt={splitSelectedAt}
                        onDeleteSelected={handleDeleteSelected}
                        onUndo={undo}
                        onPreviewEdited={previewEditedResult}
                        onResetTrim={handleResetTrim}
                        skimmingEnabled={!isPlaying}
                    />
                }
            />
        </div>
    );
};
