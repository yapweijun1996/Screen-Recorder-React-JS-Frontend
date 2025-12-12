import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ExportOptions, VIDEO_QUALITY_PRESETS, VideoQualityPreset } from '../types';

export type FFmpegLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface FFmpegProgress {
    ratio: number; // 0-1
    time?: number;
}

/** Resolution mappings */
const RESOLUTION_MAP: Record<string, { width: number; height: number } | null> = {
    original: null, // No scaling
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};

/**
 * Convert @ffmpeg/ffmpeg FileData (may be backed by SharedArrayBuffer) into an ArrayBuffer-backed Uint8Array,
 * so it can be safely used as a BlobPart without TS type issues.
 */
const toArrayBufferUint8 = (data: Uint8Array): Uint8Array<ArrayBuffer> => {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    return new Uint8Array(ab);
};

class FFmpegService {
    private ffmpeg: FFmpeg | null = null;
    private loadStatus: FFmpegLoadStatus = 'idle';
    private loadPromise: Promise<void> | null = null;
    private onProgressCallback: ((progress: FFmpegProgress) => void) | null = null;
    private onStatusChangeCallback: ((status: FFmpegLoadStatus) => void) | null = null;

    /**
     * Subscribe to status changes
     */
    onStatusChange(callback: (status: FFmpegLoadStatus) => void) {
        this.onStatusChangeCallback = callback;
        callback(this.loadStatus);
    }

    /**
     * Subscribe to processing progress
     */
    onProgress(callback: (progress: FFmpegProgress) => void) {
        this.onProgressCallback = callback;
    }

    private setStatus(status: FFmpegLoadStatus) {
        this.loadStatus = status;
        this.onStatusChangeCallback?.(status);
    }

    /**
     * Preload FFmpeg.wasm in the background.
     */
    async preload(): Promise<void> {
        if (this.loadStatus === 'loaded') return;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = this.load();
        return this.loadPromise;
    }

    /**
     * Initialize FFmpeg.wasm.
     */
    async load(): Promise<void> {
        if (this.loadStatus === 'loaded' && this.ffmpeg) return;

        this.setStatus('loading');

        this.ffmpeg = new FFmpeg();

        this.ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg Log]:', message);
        });

        this.ffmpeg.on('progress', ({ progress, time }) => {
            this.onProgressCallback?.({ ratio: progress, time });
        });

        // IMPORTANT: use BASE_URL so worker/core files resolve from site root, not from /assets/ (bundled chunks).
        // Example: in production, chunks are served from /assets/*.js; using "./ffmpeg/worker.js" would incorrectly
        // resolve to /assets/ffmpeg/worker.js and return index.html (text/html) -> MIME error.
        const basePath = import.meta.env.BASE_URL || '/';
        const baseURLObject = new URL(basePath, window.location.origin);
        // Force a root-anchored path ("/" or "/app/") so worker URLs don't resolve relative to chunk URLs like /assets/*
        const normalizedBase = baseURLObject.pathname.endsWith('/')
            ? baseURLObject.pathname
            : `${baseURLObject.pathname}/`;
        const mtBaseURL = `${normalizedBase}ffmpeg-mt`;
        const baseURL = `${normalizedBase}ffmpeg`;
        const bridgeWorkerURL = `${normalizedBase}ffmpeg/worker.js`; // control worker shipped with @ffmpeg/ffmpeg

        // Prefer multi-threaded core; fall back to the single-thread build if it fails.
        const loadWithConfig = async (cfgBase: string, threaded: boolean) => {
            console.info(`[FFmpeg] Loading ${threaded ? 'multi' : 'single'}-thread core from ${cfgBase}`);
            await this.ffmpeg!.load({
                // Use the upstream worker bridge and swap core binaries
                classWorkerURL: bridgeWorkerURL,
                coreURL: `${cfgBase}/ffmpeg-core.js`,
                wasmURL: `${cfgBase}/ffmpeg-core.wasm`,
                workerURL: `${cfgBase}/${threaded ? 'ffmpeg-core.worker.js' : 'worker.js'}`,
            });
        };

        try {
            console.time('[FFmpeg] multi-thread load');
            await loadWithConfig(mtBaseURL, true);
            console.timeEnd('[FFmpeg] multi-thread load');
            console.info('[FFmpeg] Loaded multi-threaded core');
            this.setStatus('loaded');
            return;
        } catch (mtError) {
            console.warn('[FFmpeg] Multi-thread load failed, falling back to single-threaded core', mtError);
        }

        try {
            console.time('[FFmpeg] single-thread load');
            await loadWithConfig(baseURL, false);
            console.timeEnd('[FFmpeg] single-thread load');
            this.setStatus('loaded');
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            this.setStatus('error');
            throw new Error('Failed to load video processing engine. Please check your network connection.');
        }
    }

    /**
     * Get estimated output file size based on quality and duration
     */
    estimateFileSize(durationSeconds: number, quality: VideoQualityPreset): string {
        const config = VIDEO_QUALITY_PRESETS[quality];
        // Rough estimate: bitrate * duration / 8 (bits to bytes)
        const videoBitrate = config.videoBitsPerSecond;
        const audioBitrate = parseInt(config.audioBitrate) * 1000; // e.g., 128k -> 128000
        const totalBitrate = videoBitrate + audioBitrate;
        const bytes = (totalBitrate * durationSeconds) / 8;

        if (bytes < 1024 * 1024) {
            return `~${(bytes / 1024).toFixed(1)} KB`;
        } else if (bytes < 1024 * 1024 * 1024) {
            return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            return `~${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
    }

    /**
     * Converts a WebM Blob to MP4/WebM with configurable quality settings
     */
    async processVideo(
        inputBlob: Blob,
        options: ExportOptions = { quality: 'medium' }
    ): Promise<Blob> {
        if (!this.ffmpeg || this.loadStatus !== 'loaded') {
            await this.load();
        }
        const ffmpeg = this.ffmpeg!;

        const qualityConfig = VIDEO_QUALITY_PRESETS[options.quality];
        const crfValueRaw = options.crf ?? qualityConfig.crf;
        const crfValue = Math.min(Math.max(crfValueRaw, 0), 51); // clamp to ffmpeg CRF range
        const format = options.format || 'mp4';
        const inputName = 'input.webm';
        const outputName = `output.${format}`;

        // 1. Write file to FFmpeg's virtual file system
        await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));

        // 2. Build command
        const args: string[] = ['-i', inputName];

        // Trimming
        if (options.trimStart !== undefined && options.trimEnd !== undefined) {
            if (options.trimEnd <= options.trimStart) {
                throw new Error('Invalid trim range. End must be greater than start.');
            }
            args.push('-ss', options.trimStart.toFixed(3));
            args.push('-to', options.trimEnd.toFixed(3));
        }

        // Resolution scaling
        const resolution = options.resolution || 'original';
        const resConfig = RESOLUTION_MAP[resolution];
        const targetFps = Number.isFinite(options.fps) && options.fps! > 0 ? Math.round(options.fps!) : 30;
        const filters: string[] = [];
        if (resConfig) {
            // Scale while maintaining aspect ratio, pad if necessary
            filters.push(`scale=${resConfig.width}:${resConfig.height}:force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2`);
        }
        // Normalize frame cadence to avoid inflated duration from odd timebases
        filters.push(`fps=${targetFps}`);
        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }

        // Video codec and quality settings
        if (format === 'mp4') {
            args.push('-c:v', 'libx264');

            // CRF for quality (only if not lossless)
            if (crfValue > 0) {
                args.push('-crf', crfValue.toString());
            } else {
                // Lossless mode
                args.push('-crf', '0');
            }

            args.push('-preset', qualityConfig.ffmpegPreset);

            // Pixel format for compatibility
            args.push('-pix_fmt', 'yuv420p');

            // Audio
            args.push('-c:a', 'aac', '-b:a', qualityConfig.audioBitrate);

            // Faststart for web playback (moov atom at beginning)
            args.push('-movflags', '+faststart');
        } else if (format === 'webm') {
            args.push('-c:v', 'libvpx-vp9');
            args.push('-crf', crfValue.toString());
            args.push('-b:v', '0'); // Use CRF mode
            args.push('-c:a', 'libopus', '-b:a', qualityConfig.audioBitrate);
        }

        args.push(outputName);

        // 3. Run command
        console.log('Running FFmpeg command:', args.join(' '));
        await ffmpeg.exec(args);

        // 4. Read result
        const data = await ffmpeg.readFile(outputName);
        if (typeof data === 'string') {
            throw new Error('FFmpeg output is a string; expected binary data.');
        }

        // Cleanup
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
        const u8 = toArrayBufferUint8(data);
        return new Blob([u8], { type: mimeType });
    }

    /**
     * Fix WebM blob to have proper duration metadata for seeking
     * This re-muxes the WebM to add proper duration
     */
    async fixWebmDuration(inputBlob: Blob, duration: number): Promise<Blob> {
        if (!this.ffmpeg || this.loadStatus !== 'loaded') {
            await this.load();
        }
        const ffmpeg = this.ffmpeg!;

        const inputName = 'input.webm';
        const outputName = 'fixed.webm';

        await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));

        // Re-mux without re-encoding to fix duration metadata
        const args = [
            '-i', inputName,
            '-c', 'copy', // Copy streams without re-encoding
            '-fflags', '+genpts', // Generate presentation timestamps
            outputName
        ];

        console.log('Fixing WebM duration metadata...');
        await ffmpeg.exec(args);

        const data = await ffmpeg.readFile(outputName);
        if (typeof data === 'string') {
            throw new Error('FFmpeg output is a string; expected binary data.');
        }

        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        const u8 = toArrayBufferUint8(data);
        return new Blob([u8], { type: 'video/webm' });
    }

    getStatus(): FFmpegLoadStatus {
        return this.loadStatus;
    }

    isLoaded(): boolean {
        return this.loadStatus === 'loaded';
    }
}

export const ffmpegService = new FFmpegService();
