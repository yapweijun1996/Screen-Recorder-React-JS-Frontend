import { useEffect } from 'react';
import type { VideoQualityPreset } from '../types';
import { exportService } from '../services/exportService';
import { awaitWithAbort } from '../services/webcodecs/mediaWait';
import { useExportJob } from './useExportOperation';

export type ConverterFormat = 'mp4' | 'mp3';
export type ConverterStatus = 'idle' | 'converting' | 'undownloaded';

interface ConverterOptions {
    format: ConverterFormat;
    quality: VideoQualityPreset;
}

async function processConversion(
    file: Blob,
    { format, quality }: ConverterOptions,
    signal: AbortSignal,
    onProgress: (progress: { ratio: number }) => void,
) {
    if (format === 'mp3') {
        const { exportMp3 } = await awaitWithAbort(import('../services/mp3ExportService'), signal);
        return exportMp3(file, quality, signal, onProgress);
    }
    return exportService.processVideo(file, { quality, format, resolution: 'original', fps: 30 }, signal, onProgress);
}

export function useConverterSession(t: (key: string) => string, onStatusChange: (status: ConverterStatus) => void) {
    const operation = useExportJob(t, 'converter.error', processConversion, true);
    const status = operation.isProcessing ? 'converting' : operation.awaitingDownload ? 'undownloaded' : 'idle';

    useEffect(() => { onStatusChange(status); }, [onStatusChange, status]);
    const needsWarning = status !== 'idle';
    useEffect(() => {
        if (!needsWarning) return;
        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = true;
        };
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, [needsWarning]);

    return operation;
}
