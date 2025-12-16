import { useEffect, useState } from 'react';
import type { ExportFormat, ExportOptions, ExportResolution, ExportFrameRateOption, TrimRange, VideoMetadata, VideoQualityPreset } from '../../types';
import { ffmpegService } from '../../services/ffmpegService';

interface UseEditorExportControllerArgs {
    videoMetadata: VideoMetadata;
    segments: TrimRange[];

    selectedQuality: VideoQualityPreset;
    selectedResolution: ExportResolution;
    selectedFormat: ExportFormat;
    selectedFps: ExportFrameRateOption;
    customCrf: number;

    playbackError: string | null;
    setPlaybackError: (msg: string | null) => void;

    t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Editor 匯出流程集中管理：
 * - 追蹤 FFmpeg 進度 / ETA
 * - 產生 export blob URL（並在切換/卸載時 revoke）
 * - 將錯誤變成 UI 可顯示的字串（避免用 alert）
 */
export const useEditorExportController = ({
    videoMetadata,
    segments,
    selectedQuality,
    selectedResolution,
    selectedFormat,
    selectedFps,
    customCrf,
    playbackError,
    setPlaybackError,
    t,
}: UseEditorExportControllerArgs) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingEta, setProcessingEta] = useState<string | null>(null);
    const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
    const [exportUrl, setExportUrl] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

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
            if (exportUrl) URL.revokeObjectURL(exportUrl);
        };
    }, [exportUrl]);

    const exportVideo = async (mode: 'full' | 'trimmed') => {
        setExportError(null);

        // 使用同一份播放錯誤顯示（避免 UI 出現兩套錯誤訊息）
        if (playbackError || videoMetadata.duration <= 0) {
            setPlaybackError(t('editor.playback.cannotExport'));
            return;
        }

        const totalSelected = segments.reduce((sum, s) => sum + Math.max(s.end - s.start, 0), 0);
        if (mode === 'trimmed' && totalSelected <= 0) {
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
            };

            if (mode === 'trimmed') {
                if (segments.length > 1) {
                    options.segments = segments.map((s) => ({ start: s.start, end: s.end }));
                } else if (segments.length === 1) {
                    options.trimStart = segments[0].start;
                    options.trimEnd = segments[0].end;
                }
            }

            const outputBlob = await ffmpegService.processVideo(videoMetadata.blob, options);
            const url = URL.createObjectURL(outputBlob);
            setExportUrl(url);
        } catch (error) {
            console.error(error);
            setExportError(t('editor.export.failed'));
        } finally {
            setIsProcessing(false);
            setProcessingProgress(0);
            setProcessingEta(null);
            setProcessingStartTime(null);
        }
    };

    return {
        // state
        isProcessing,
        processingProgress,
        processingEta,
        exportUrl,
        exportError,

        // actions
        exportTrimmed: () => exportVideo('trimmed'),
        exportFull: () => exportVideo('full'),
        clearExportUrl: () => setExportUrl(null),
        clearExportError: () => setExportError(null),
    };
};

const formatEta = (ms: number) => {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.max(totalSeconds % 60, 0);
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
};
