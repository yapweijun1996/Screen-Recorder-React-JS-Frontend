import { useEffect, useState } from 'react';
import type { ExportFormat, ExportOptions, ExportResolution, ExportFrameRateOption, TrimRange, VideoMetadata, VideoQualityPreset } from '../../types';
import { exportService } from '../../services/exportService';

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

    // Subscribe to export progress
    useEffect(() => {
        const handler = ({ ratio }: { ratio: number }) => {
            const clamped = Math.max(0, Math.min(1, ratio));
            setProcessingProgress(Math.round(clamped * 100));

            if (processingStartTime && clamped > 0) {
                const elapsedMs = Date.now() - processingStartTime;
                const etaMs = (elapsedMs / clamped) - elapsedMs;
                if (Number.isFinite(etaMs) && etaMs >= 0) {
                    setProcessingEta(formatEta(etaMs));
                }
            }
        };

        exportService.onProgress(handler);

        return () => {
            exportService.offProgress(handler);
        };
    }, [processingStartTime]);

    // Revoke generated blob URLs when component unmounts or new exports are created
    useEffect(() => {
        return () => {
            if (exportUrl) URL.revokeObjectURL(exportUrl);
        };
    }, [exportUrl]);

    const exportVideo = async (mode: 'full' | 'trimmed') => {
        setExportError(null);

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

            const outputBlob = await exportService.processVideo(videoMetadata.blob, options);
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
        isProcessing,
        processingProgress,
        processingEta,
        exportUrl,
        exportError,
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
