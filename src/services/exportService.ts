/**
 * Export Service
 *
 * Uses WebCodecs API + mp4-muxer for H.264 MP4 export.
 * License: MIT — no GPL dependencies.
 *
 * For browsers without WebCodecs support (~4.5%),
 * MediaRecorder WebM output is used as fallback (no export processing).
 */

import type { ExportFormat, ExportOptions, VideoQualityPreset } from '../types';
import { VIDEO_QUALITY_PRESETS } from '../types';
import { detectWebCodecsSupport, getCachedSupport } from './webcodecs/capability';
import { exportWithWebCodecs, type WebCodecsExportResult } from './webcodecs/webcodecExportService';

export type ExportEngineType = 'webcodecs' | 'none';
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EngineProgress {
    ratio: number; // 0-1
}

class ExportService {
    private engine: ExportEngineType = 'none';
    private status: EngineStatus = 'idle';
    private onStatusChangeCallback: ((status: EngineStatus) => void) | null = null;
    private onProgressCallback: ((progress: EngineProgress) => void) | null = null;
    private initPromise: Promise<void> | null = null;

    onStatusChange(callback: (status: EngineStatus) => void) {
        this.onStatusChangeCallback = callback;
        callback(this.status);
    }

    offStatusChange(callback: (status: EngineStatus) => void) {
        if (this.onStatusChangeCallback === callback) this.onStatusChangeCallback = null;
    }

    onProgress(callback: (progress: EngineProgress) => void) {
        this.onProgressCallback = callback;
    }

    offProgress(callback: (progress: EngineProgress) => void) {
        if (this.onProgressCallback === callback) this.onProgressCallback = null;
    }

    private setStatus(status: EngineStatus) {
        this.status = status;
        this.onStatusChangeCallback?.(status);
    }

    getEngine(): ExportEngineType {
        return this.engine;
    }

    getStatus(): EngineStatus {
        return this.status;
    }

    /**
     * Initialize the export engine.
     * Call early (on app mount) to detect WebCodecs capabilities.
     */
    async init(): Promise<void> {
        if (this.status === 'ready') return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._init();
        return this.initPromise;
    }

    private async _init(): Promise<void> {
        this.setStatus('loading');

        try {
            const support = await detectWebCodecsSupport();
            if (support.supported) {
                this.engine = 'webcodecs';
                this.setStatus('ready');
                const codec = support.h264 ? 'H.264/MP4' : 'VP8/WebM';
                console.info(`[ExportService] WebCodecs ready — ${codec} (MIT, hardware-accelerated)`);
                return;
            }
            console.warn('[ExportService] WebCodecs not supported in this browser');
        } catch (e) {
            console.error('[ExportService] WebCodecs detection failed:', e);
        }

        this.engine = 'none';
        this.setStatus('error');
    }

    /**
     * Estimate output file size.
     */
    estimateFileSize(durationSeconds: number, quality: VideoQualityPreset, format: ExportFormat = 'mp4'): string {
        const config = VIDEO_QUALITY_PRESETS[quality];
        const videoBitrate = config.videoBitsPerSecond;
        const audioBitrate = parseInt(config.audioBitrate) * 1000;
        const totalBitrate = format === 'audio' ? audioBitrate : videoBitrate + audioBitrate;
        const bytes = (totalBitrate * durationSeconds) / 8;

        if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `~${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    /**
     * Export video to MP4 using WebCodecs + mp4-muxer.
     * Pass `signal` to allow the caller to cancel; the returned promise will
     * reject with `DOMException('Export cancelled', 'AbortError')`.
     */
    async processVideo(
        inputBlob: Blob,
        options: ExportOptions,
        signal?: AbortSignal,
    ): Promise<WebCodecsExportResult> {
        if (this.status !== 'ready') await this.init();

        if (this.engine !== 'webcodecs') {
            throw new Error(
                'WebCodecs is not supported in this browser. ' +
                'Please use Chrome 94+, Edge 94+, or Firefox 130+ for MP4 export.'
            );
        }

        return exportWithWebCodecs(
            inputBlob,
            options,
            (progress) => {
                this.onProgressCallback?.({ ratio: progress.ratio });
            },
            signal,
        );
    }

    /**
     * Fix WebM duration metadata.
     * Without FFmpeg, we return the blob unchanged.
     * Seeking may not work perfectly on raw MediaRecorder output,
     * but the export pipeline handles it correctly.
     */
    async fixWebmDuration(inputBlob: Blob, _duration: number): Promise<Blob> {
        return inputBlob;
    }
}

export const exportService = new ExportService();
