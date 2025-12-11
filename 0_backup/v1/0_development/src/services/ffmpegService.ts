import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ExportOptions, VIDEO_QUALITY_PRESETS, VideoQualityPreset } from '../types';

export type FFmpegLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface FFmpegProgress {
    ratio: number; // 0-1
    time?: number;
}

// Resolution mappings
const RESOLUTION_MAP = {
    'original': null, // No scaling
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
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

        try {
            const baseURL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/ffmpeg`;
            await this.ffmpeg.load({
                classWorkerURL: `${baseURL}/worker.js`,
                coreURL: `${baseURL}/ffmpeg-core.js`,
                wasmURL: `${baseURL}/ffmpeg-core.wasm`,
                workerURL: `${baseURL}/worker.js`,
            });
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
        if (resConfig) {
            // Scale while maintaining aspect ratio, pad if necessary
            args.push('-vf', `scale=${resConfig.width}:${resConfig.height}:force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2`);
        }

        // Video codec and quality settings
        if (format === 'mp4') {
            args.push('-c:v', 'libx264');

            // CRF for quality (only if not lossless)
            if (qualityConfig.crf > 0) {
                args.push('-crf', qualityConfig.crf.toString());
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
            args.push('-crf', qualityConfig.crf.toString());
            args.push('-b:v', '0'); // Use CRF mode
            args.push('-c:a', 'libopus', '-b:a', qualityConfig.audioBitrate);
        }

        args.push(outputName);

        // 3. Run command
        console.log('Running FFmpeg command:', args.join(' '));
        await ffmpeg.exec(args);

        // 4. Read result
        const data = await ffmpeg.readFile(outputName);

        // Cleanup
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
        return new Blob([data], { type: mimeType });
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

        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        return new Blob([data], { type: 'video/webm' });
    }

    getStatus(): FFmpegLoadStatus {
        return this.loadStatus;
    }

    isLoaded(): boolean {
        return this.loadStatus === 'loaded';
    }
}

export const ffmpegService = new FFmpegService();
