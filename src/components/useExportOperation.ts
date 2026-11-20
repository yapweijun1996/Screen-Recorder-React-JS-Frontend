import { useEffect, useRef, useState } from 'react';
import type { ExportOptions, ExportOutputFormat, VideoQualityPreset } from '../types';
import { exportService } from '../services/exportService';
import { getExportErrorMessage } from '../services/webcodecs/exportErrors';
import { generateFileName } from '../utils/format';
import { ExportTaskScope } from './ExportTaskScope';
import { taskActivity } from '../services/taskActivity';

type Result<Format extends ExportOutputFormat> = { blob: Blob; format: Format };
type Output<Format extends ExportOutputFormat> = Result<Format> & { url: string; fileName: string };
type RunExport<Options, Format extends ExportOutputFormat> = (
    blob: Blob,
    options: Options,
    signal: AbortSignal,
    onProgress: (progress: { ratio: number }) => void,
) => Promise<Result<Format>>;

export function useExportJob<Options, Format extends ExportOutputFormat>(
    t: (key: string) => string,
    errorKey: string,
    process: RunExport<Options, Format>,
    protectResult = false,
) {
    const [scope] = useState(() => new ExportTaskScope());
    const [output, setOutput] = useState<Output<Format> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [eta, setEta] = useState<string | null>(null);
    const [awaitingDownload, setAwaitingDownload] = useState(false);
    const releaseDownloadProtection = useRef<(() => void) | null>(null);

    useEffect(() => {
        scope.activate();
        return () => {
            releaseDownloadProtection.current?.();
            releaseDownloadProtection.current = null;
            scope.dispose();
        };
    }, [scope]);

    const resetProgress = () => { setIsProcessing(false); setProgress(0); setEta(null); };
    const acknowledgeDownload = () => {
        releaseDownloadProtection.current?.();
        releaseDownloadProtection.current = null;
        setAwaitingDownload(false);
    };
    const clearOutput = () => { scope.clearOutput(); acknowledgeDownload(); setOutput(null); };
    const cancel = () => { scope.cancel(); resetProgress(); };

    const run = async (blob: Blob, options: Options, baseName: string) => {
        const controller = scope.start();
        acknowledgeDownload();
        const startedAt = Date.now();
        setError(null);
        setOutput(null);
        setIsProcessing(true);
        setProgress(0);
        setEta(null);
        try {
            const result = await process(blob, options, controller.signal, ({ ratio }) => {
                if (!scope.isCurrent(controller)) return;
                const clamped = Math.max(0, Math.min(1, ratio));
                setProgress(Math.round(clamped * 100));
                if (clamped > 0) {
                    const elapsed = Date.now() - startedAt;
                    const seconds = Math.max(0, Math.round((elapsed / clamped - elapsed) / 1000));
                    if (Number.isFinite(seconds)) setEta(seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`);
                }
            });
            const url = scope.publish(controller, result.blob);
            if (!url) return;
            // Acquire before finish releases the export lease, so a waiting
            // application update cannot slip between conversion and download.
            if (protectResult) {
                releaseDownloadProtection.current = taskActivity.begin();
                setAwaitingDownload(true);
            }
            const extension = result.format === 'audio' ? (result.blob.type.includes('webm') ? 'webm' : 'm4a') : result.format;
            setOutput({ ...result, url, fileName: generateFileName(baseName, extension) });
        } catch (failure) {
            if (scope.isCurrent(controller) && !(failure instanceof DOMException && failure.name === 'AbortError')) {
                console.error(failure);
                setError(getExportErrorMessage(failure, t, errorKey));
            }
        } finally {
            if (scope.isCurrent(controller)) {
                scope.finish(controller);
                resetProgress();
            }
        }
    };
    return { output, error, isProcessing, progress, eta, awaitingDownload, acknowledgeDownload, run, cancel, clearOutput, clearError: () => setError(null) };
}

type RecordingExportOptions = ExportOptions | { format: 'mp3'; quality: VideoQualityPreset };

const processRecording: RunExport<RecordingExportOptions, ExportOutputFormat> =
    (blob, options, signal, onProgress) => options.format === 'mp3'
        ? exportService.processMp3(blob, options.quality, signal, onProgress)
        : exportService.processVideo(blob, options, signal, onProgress);

export function useExportOperation(t: (key: string) => string, errorKey: string) {
    return useExportJob(t, errorKey, processRecording);
}
