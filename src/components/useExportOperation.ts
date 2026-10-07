import { useEffect, useState } from 'react';
import type { ExportOptions } from '../types';
import { exportService } from '../services/exportService';
import { getExportErrorMessage } from '../services/webcodecs/exportErrors';
import type { WebCodecsExportResult } from '../services/webcodecs/webcodecExportService';
import { generateFileName } from '../utils/format';
import { ExportTaskScope } from './ExportTaskScope';

type Output = WebCodecsExportResult & { url: string; fileName: string };

export function useExportOperation(t: (key: string) => string, errorKey: string) {
    const [scope] = useState(() => new ExportTaskScope());
    const [output, setOutput] = useState<Output | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [eta, setEta] = useState<string | null>(null);

    useEffect(() => {
        scope.activate();
        return () => scope.dispose();
    }, [scope]);

    const resetProgress = () => { setIsProcessing(false); setProgress(0); setEta(null); };
    const clearOutput = () => { scope.clearOutput(); setOutput(null); };
    const cancel = () => { scope.cancel(); resetProgress(); };

    const run = async (blob: Blob, options: ExportOptions, baseName: string) => {
        const controller = scope.start();
        const startedAt = Date.now();
        setError(null);
        setOutput(null);
        setIsProcessing(true);
        setProgress(0);
        setEta(null);
        try {
            const result = await exportService.processVideo(blob, options, controller.signal, ({ ratio }) => {
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
    return { output, error, isProcessing, progress, eta, run, cancel, clearOutput, clearError: () => setError(null) };
}
