import type { ExportFormat, ExportOptions, ExportResolution, ExportFrameRateOption, TrimRange, VideoMetadata, VideoQualityPreset } from '../../types';
import { generateFileName } from '../../utils/format';
import { useExportOperation } from '../useExportOperation';

interface UseEditorExportControllerArgs {
    videoMetadata: VideoMetadata;
    segments: TrimRange[];
    selectedQuality: VideoQualityPreset;
    selectedResolution: ExportResolution;
    selectedFormat: ExportFormat;
    selectedFps: ExportFrameRateOption;
    playbackError: string | null;
    setPlaybackError: (msg: string | null) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

export const useEditorExportController = ({
    videoMetadata, segments, selectedQuality, selectedResolution,
    selectedFormat, selectedFps, playbackError, setPlaybackError, t,
}: UseEditorExportControllerArgs) => {
    const operation = useExportOperation(t, 'editor.export.failed');

    const exportVideo = async (mode: 'full' | 'trimmed') => {
        operation.clearError();
        if (playbackError || videoMetadata.duration <= 0) {
            setPlaybackError(t('editor.playback.cannotExport'));
            return;
        }
        const totalSelected = segments.reduce((sum, segment) => sum + Math.max(segment.end - segment.start, 0), 0);
        if (mode === 'trimmed' && totalSelected <= 0) {
            setPlaybackError(t('editor.playback.trimInvalid'));
            return;
        }
        const options: ExportOptions = {
            quality: selectedQuality, resolution: selectedResolution,
            format: selectedFormat, fps: selectedFps,
        };
        if (mode === 'trimmed') options.segments = segments.map(segment => ({ ...segment }));
        await operation.run(videoMetadata.blob, options, 'screen-recording');
    };

    return {
        isProcessing: operation.isProcessing,
        processingProgress: operation.progress,
        processingEta: operation.eta,
        exportUrl: operation.output?.url ?? null,
        exportFormat: operation.output?.format ?? selectedFormat,
        exportError: operation.error,
        exportTrimmed: () => exportVideo('trimmed'),
        exportFull: () => exportVideo('full'),
        cancelExport: operation.cancel,
        clearExportUrl: operation.clearOutput,
        clearExportError: operation.clearError,
        exportDownloadFileName: operation.output?.fileName ?? generateFileName('screen-recording', selectedFormat === 'audio' ? 'm4a' : selectedFormat),
    };
};
