import type { ExportResolution, VideoQualityPreset } from '../../types';
import { VIDEO_QUALITY_PRESETS } from '../../types';
import { releaseVideo, seekVideo, waitForMedia } from './mediaWait';
export { throwIfAborted } from './mediaWait';

const RESOLUTION_MAP: Record<ExportResolution, { width: number; height: number } | null> = {
    original: null,
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};

export function getExportDimensions(sourceWidth: number, sourceHeight: number, resolution: ExportResolution) {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Invalid source video dimensions');
    }
    const preset = RESOLUTION_MAP[resolution];
    let scale = 1;
    if (preset) {
        const portrait = sourceHeight > sourceWidth;
        const boxWidth = portrait ? preset.height : preset.width;
        const boxHeight = portrait ? preset.width : preset.height;
        scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
    }
    // Fit the preset in the source orientation. Even dimensions satisfy H.264;
    // contain drawing preserves the exact ratio across subpixel rounding.
    return {
        width: Math.max(2, Math.round(sourceWidth * scale / 2) * 2),
        height: Math.max(2, Math.round(sourceHeight * scale / 2) * 2),
    };
}

export function getAvcCodecString(width: number, height: number): string {
    const area = width * height;
    if (area <= 921600)  return 'avc1.42001f';
    if (area <= 2088960) return 'avc1.640028';
    if (area <= 8355840) return 'avc1.640032';
    return 'avc1.640033';
}

export function getVideoBitrate(quality: VideoQualityPreset, width: number, height: number): number {
    const preset = VIDEO_QUALITY_PRESETS[quality];
    const pixelRatio = (width * height) / (1920 * 1080);
    return Math.round(preset.videoBitsPerSecond * Math.max(0.5, Math.min(3, pixelRatio)));
}

export function getAudioBitrate(quality: VideoQualityPreset): number {
    return parseInt(VIDEO_QUALITY_PRESETS[quality].audioBitrate) * 1000;
}

export function normalizeSegments(segments: Array<{ start: number; end: number }>) {
    return segments
        .map((s) => ({ start: Number(s.start), end: Number(s.end) }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
        .sort((a, b) => a.start - b.start);
}

interface SourceVideo {
    video: HTMLVideoElement;
    release: () => void;
    width: number;
    height: number;
    duration: number;
}

/**
 * Set up a hidden <video> element for the input blob and wait until dimensions
 * and a finite duration are available. Includes the Chrome MediaRecorder
 * duration=Infinity workaround.
 */
export async function openSourceVideo(blob: Blob, signal?: AbortSignal): Promise<SourceVideo> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        releaseVideo(video, url);
    };
    try {
        await waitForMedia(video, 'loadedmetadata', {
            signal, ready: () => video.readyState >= 1, action: () => { video.src = url; },
        });
        await waitForMedia(video, 'canplay', { signal, ready: () => video.readyState >= 2 });

        // MediaRecorder WebM may report Infinity until a seek scans its end.
        if (!Number.isFinite(video.duration)) {
            await seekVideo(video, 1e101, signal);
            await seekVideo(video, 0, signal);
        }
        if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Invalid video duration');
        return { video, release, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    } catch (error) {
        release();
        throw error;
    }
}
