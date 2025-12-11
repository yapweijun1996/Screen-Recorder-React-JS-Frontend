export enum AppStatus {
    IDLE = 'IDLE',
    RECORDING = 'RECORDING',
    REVIEWING = 'REVIEWING',
    PROCESSING = 'PROCESSING',
    ERROR = 'ERROR'
}

export interface VideoMetadata {
    blob: Blob;
    url: string;
    duration: number; // in seconds
}

export interface TrimRange {
    start: number;
    end: number;
}

// PIP Position for draggable camera overlay
export type PIPPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';

export interface PIPConfig {
    position: PIPPosition;
    x?: number; // Custom X coordinate (0-1 range, percentage)
    y?: number; // Custom Y coordinate (0-1 range, percentage)
    size: number; // Size as percentage of canvas width (0.1 = 10%)
}

// Video Quality Presets
export type VideoQualityPreset = 'low' | 'medium' | 'high' | 'lossless';

export interface VideoQualityConfig {
    preset: VideoQualityPreset;
    label: string;
    description: string;
    // FFmpeg settings
    crf: number; // Constant Rate Factor (0-51, lower = better quality)
    ffmpegPreset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
    audioBitrate: string; // e.g., '128k', '192k', '320k'
    // Recording settings
    videoBitsPerSecond: number; // MediaRecorder bitrate
}

export const VIDEO_QUALITY_PRESETS: Record<VideoQualityPreset, VideoQualityConfig> = {
    low: {
        preset: 'low',
        label: 'Low (Fast)',
        description: 'Smaller file size, faster processing',
        crf: 28,
        ffmpegPreset: 'ultrafast',
        audioBitrate: '96k',
        videoBitsPerSecond: 1_500_000, // 1.5 Mbps
    },
    medium: {
        preset: 'medium',
        label: 'Medium (Balanced)',
        description: 'Good balance of quality and size',
        crf: 20, // default export CRF closer to visually lossless
        ffmpegPreset: 'fast',
        audioBitrate: '128k',
        videoBitsPerSecond: 3_000_000, // 3 Mbps
    },
    high: {
        preset: 'high',
        label: 'High (Quality)',
        description: 'High quality, larger file size',
        crf: 18,
        ffmpegPreset: 'medium',
        audioBitrate: '192k',
        videoBitsPerSecond: 5_000_000, // 5 Mbps
    },
    lossless: {
        preset: 'lossless',
        label: 'Lossless (Max)',
        description: 'Best quality, very large file',
        crf: 0,
        ffmpegPreset: 'slow',
        audioBitrate: '320k',
        videoBitsPerSecond: 10_000_000, // 10 Mbps
    }
};

// Export Options
export interface ExportOptions {
    trimStart?: number;
    trimEnd?: number;
    quality: VideoQualityPreset;
    resolution?: 'original' | '720p' | '1080p' | '4k';
    format?: 'mp4' | 'webm';
    fps?: number; // Target frame rate for export
    crf?: number; // Optional override for Constant Rate Factor (lower = higher quality)
}

// Recording Quality
export type RecordingQuality = 'standard' | 'high' | 'ultra' | 'custom';

export interface RecordingConfig {
    quality: RecordingQuality;
    frameRate: number;
    videoBitsPerSecond: number;
}

export const RECORDING_PRESETS: Record<RecordingQuality, RecordingConfig> = {
    standard: {
        quality: 'standard',
        frameRate: 30,
        videoBitsPerSecond: 5_000_000, // 5 Mbps
    },
    high: {
        quality: 'high',
        frameRate: 30,
        videoBitsPerSecond: 10_000_000, // 10 Mbps
    },
    ultra: {
        quality: 'ultra',
        frameRate: 60,
        videoBitsPerSecond: 20_000_000, // 20 Mbps
    },
    custom: {
        quality: 'custom',
        frameRate: 60,
        videoBitsPerSecond: 12_000_000, // default 12 Mbps (overridable)
    }
};
