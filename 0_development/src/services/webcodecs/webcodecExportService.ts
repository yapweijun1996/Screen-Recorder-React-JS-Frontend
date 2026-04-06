/**
 * WebCodecs-based video export service.
 * Decodes input WebM via <video> + canvas, re-encodes and muxes to MP4 or WebM.
 *
 * Chrome/Edge: H.264 + AAC → MP4 (via mp4-muxer)
 * Firefox:     VP8 + Opus → WebM (via webm-muxer)
 *
 * License: MIT (no GPL dependencies)
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { ExportOptions, VideoQualityPreset } from '../../types';
import { VIDEO_QUALITY_PRESETS } from '../../types';
import { getCachedSupport, type WebCodecsSupport } from './capability';

export interface ExportProgress {
    ratio: number;
    phase: 'decoding' | 'encoding' | 'muxing';
}

const RESOLUTION_MAP: Record<string, { width: number; height: number } | null> = {
    original: null,
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};

/**
 * Select AVC profile/level string based on resolution.
 * Coded area = width * ceil_to_16(height).
 */
function getAvcCodecString(width: number, height: number): string {
    const area = width * height;
    // Baseline profile (42), constraint set (00), level
    if (area <= 921600)  return 'avc1.42001f'; // Level 3.1 – up to ~1280x720
    if (area <= 2088960) return 'avc1.640028'; // Level 4.0 – up to ~1920x1088
    if (area <= 8355840) return 'avc1.640032'; // Level 5.1 – up to ~3840x2176
    return 'avc1.640033';                      // Level 5.2 – 4K+
}

function getVideoBitrate(quality: VideoQualityPreset, width: number, height: number): number {
    const preset = VIDEO_QUALITY_PRESETS[quality];
    const pixelRatio = (width * height) / (1920 * 1080);
    return Math.round(preset.videoBitsPerSecond * Math.max(0.5, Math.min(3, pixelRatio)));
}

function getAudioBitrate(quality: VideoQualityPreset): number {
    return parseInt(VIDEO_QUALITY_PRESETS[quality].audioBitrate) * 1000;
}

function normalizeSegments(segments: Array<{ start: number; end: number }>) {
    return segments
        .map((s) => ({ start: Number(s.start), end: Number(s.end) }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
        .sort((a, b) => a.start - b.start);
}

/**
 * Export video using WebCodecs API.
 * Auto-selects codec based on browser capability:
 * - H.264/AAC → MP4 (Chrome, Edge)
 * - VP8/Opus → WebM (Firefox)
 */
export async function exportWithWebCodecs(
    inputBlob: Blob,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
    const support = getCachedSupport();
    if (!support || !support.supported) {
        throw new Error('WebCodecs not supported');
    }

    const useH264 = support.h264;
    const useAAC = support.aac;

    const quality = options.quality || 'medium';
    const targetFps = options.fps || 30;
    const resolution = options.resolution || 'original';
    const frameDurationUs = Math.round(1_000_000 / targetFps);

    let segments = options.segments?.length
        ? normalizeSegments(options.segments)
        : (options.trimStart !== undefined && options.trimEnd !== undefined)
            ? normalizeSegments([{ start: options.trimStart, end: options.trimEnd }])
            : null;

    // Demux input
    onProgress?.({ ratio: 0, phase: 'decoding' });
    const { videoFrames, audioBuffer, videoInfo } = await demuxBlob(inputBlob, onProgress);

    // Output dimensions
    const resConfig = RESOLUTION_MAP[resolution];
    const rawW = resConfig?.width ?? videoInfo.width;
    const rawH = resConfig?.height ?? videoInfo.height;
    const width = rawW + (rawW % 2);   // ensure even
    const height = rawH + (rawH % 2);

    const videoBitrate = getVideoBitrate(quality, width, height);
    const audioBitrate = getAudioBitrate(quality);
    const hasAudio = audioBuffer !== null && audioBuffer.length > 0;

    if (!segments) {
        segments = [{ start: 0, end: videoInfo.duration }];
    }

    const totalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    const expectedFrames = Math.ceil(totalDuration * targetFps);

    // ─── Create muxer ───
    const videoCodecStr = useH264 ? 'avc' as const : 'V_VP8' as const;
    const audioCodecStr = useAAC ? 'aac' as const : 'Opus' as const;

    let mp4Muxer: Mp4Muxer<Mp4Target> | null = null;
    let webmMuxer: WebmMuxer<WebmTarget> | null = null;
    let mp4Target: Mp4Target | null = null;
    let webmTarget: WebmTarget | null = null;

    if (useH264) {
        mp4Target = new Mp4Target();
        mp4Muxer = new Mp4Muxer({
            target: mp4Target,
            video: { codec: 'avc', width, height },
            audio: hasAudio ? {
                codec: 'aac',
                numberOfChannels: audioBuffer!.numberOfChannels,
                sampleRate: audioBuffer!.sampleRate,
            } : undefined,
            fastStart: 'in-memory',
        });
    } else {
        webmTarget = new WebmTarget();
        webmMuxer = new WebmMuxer({
            target: webmTarget,
            video: { codec: 'V_VP8', width, height },
            audio: hasAudio ? {
                codec: 'Opus',
                numberOfChannels: audioBuffer!.numberOfChannels,
                sampleRate: audioBuffer!.sampleRate,
            } : undefined,
        });
    }

    const addVideoChunk = (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
        if (mp4Muxer) mp4Muxer.addVideoChunk(chunk, meta, chunk.timestamp);
        else if (webmMuxer) webmMuxer.addVideoChunk(chunk, meta, chunk.timestamp);
    };

    const addAudioChunk = (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
        if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta, chunk.timestamp);
        else if (webmMuxer) webmMuxer.addAudioChunk(chunk, meta, chunk.timestamp);
    };

    // ─── Video encoder ───
    let encodedFrames = 0;

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
            addVideoChunk(chunk, meta ?? undefined);
            encodedFrames++;
            onProgress?.({
                ratio: Math.min(0.9, 0.3 + 0.6 * (encodedFrames / Math.max(expectedFrames, 1))),
                phase: 'encoding',
            });
        },
        error: (e) => console.error('[VideoEncoder]', e),
    });

    const videoCodec = useH264 ? getAvcCodecString(width, height) : 'vp8';
    videoEncoder.configure({
        codec: videoCodec,
        width,
        height,
        bitrate: videoBitrate,
        framerate: targetFps,
        ...(useH264 ? { avc: { format: 'avc' } } : {}),
    });

    // ─── Audio encoder ───
    let audioEncoder: AudioEncoder | null = null;
    if (hasAudio) {
        const audioCodec = useAAC ? 'mp4a.40.2' : 'opus';
        audioEncoder = new AudioEncoder({
            output: (chunk, meta) => addAudioChunk(chunk, meta ?? undefined),
            error: (e) => console.error('[AudioEncoder]', e),
        });
        audioEncoder.configure({
            codec: audioCodec,
            numberOfChannels: audioBuffer!.numberOfChannels,
            sampleRate: audioBuffer!.sampleRate,
            bitrate: audioBitrate,
        });
    }

    // ─── Encode video frames per segment ───
    onProgress?.({ ratio: 0.3, phase: 'encoding' });
    let outputTimestamp = 0;

    for (const segment of segments) {
        const segFrames = videoFrames.filter(
            (f) => f.time >= segment.start - 0.02 && f.time < segment.end + 0.02
        );

        const segDuration = segment.end - segment.start;
        const frameCount = Math.ceil(segDuration * targetFps);

        for (let i = 0; i < frameCount; i++) {
            const targetTime = segment.start + (i / targetFps);

            // Find nearest decoded frame
            let best = segFrames[0];
            let bestDist = Infinity;
            for (const f of segFrames) {
                const dist = Math.abs(f.time - targetTime);
                if (dist < bestDist) { bestDist = dist; best = f; }
            }

            if (best) {
                const frame = new VideoFrame(best.bitmap, {
                    timestamp: outputTimestamp,
                    duration: frameDurationUs,
                });
                videoEncoder.encode(frame, { keyFrame: i % (targetFps * 2) === 0 });
                frame.close();
            }

            outputTimestamp += frameDurationUs;
        }
    }

    // ─── Encode audio per segment ───
    if (audioEncoder && audioBuffer) {
        let audioOutputTime = 0;

        for (const segment of segments) {
            const startSample = Math.floor(segment.start * audioBuffer.sampleRate);
            const endSample = Math.min(
                Math.ceil(segment.end * audioBuffer.sampleRate),
                audioBuffer.length
            );
            const length = endSample - startSample;
            if (length <= 0) continue;

            // Extract planar audio data (each channel contiguous)
            const channels = audioBuffer.numberOfChannels;
            const f32 = new Float32Array(length * channels);
            for (let ch = 0; ch < channels; ch++) {
                const channelData = audioBuffer.getChannelData(ch);
                const offset = ch * length;
                for (let s = 0; s < length; s++) {
                    f32[offset + s] = channelData[startSample + s];
                }
            }

            const audioData = new AudioData({
                format: 'f32-planar' as AudioSampleFormat,
                sampleRate: audioBuffer.sampleRate,
                numberOfFrames: length,
                numberOfChannels: channels,
                timestamp: audioOutputTime,
                data: f32,
            });
            audioEncoder.encode(audioData);
            audioData.close();

            audioOutputTime += Math.round((length / audioBuffer.sampleRate) * 1_000_000);
        }
    }

    // ─── Flush and finalize ───
    onProgress?.({ ratio: 0.92, phase: 'muxing' });

    await videoEncoder.flush();
    videoEncoder.close();

    if (audioEncoder) {
        await audioEncoder.flush();
        audioEncoder.close();
    }

    // Clean up bitmaps
    for (const f of videoFrames) f.bitmap.close();

    if (mp4Muxer) {
        mp4Muxer.finalize();
        onProgress?.({ ratio: 1, phase: 'muxing' });
        return new Blob([mp4Target!.buffer], { type: 'video/mp4' });
    } else {
        webmMuxer!.finalize();
        onProgress?.({ ratio: 1, phase: 'muxing' });
        return new Blob([webmTarget!.buffer], { type: 'video/webm' });
    }
}

// ─── Demux via <video> + canvas ──────────────────────────────────────────

interface DecodedFrame {
    time: number;       // seconds
    bitmap: ImageBitmap;
}

interface VideoInfo {
    width: number;
    height: number;
    duration: number;
}

interface DemuxResult {
    videoFrames: DecodedFrame[];
    audioBuffer: AudioBuffer | null;
    videoInfo: VideoInfo;
}

async function demuxBlob(
    blob: Blob,
    onProgress?: (progress: ExportProgress) => void,
): Promise<DemuxResult> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video for demuxing'));
    });

    // Wait for video to be fully loaded
    if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
            video.oncanplay = () => resolve();
        });
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;

    const frames: DecodedFrame[] = [];
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    const seekInterval = 1 / 30;
    const totalFrames = Math.ceil(duration / seekInterval);

    for (let i = 0; i <= totalFrames; i++) {
        const time = Math.min(i * seekInterval, duration - 0.001);
        video.currentTime = time;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

        ctx.drawImage(video, 0, 0, width, height);
        const bitmap = await createImageBitmap(canvas);

        frames.push({ time, bitmap });

        if (onProgress && i % 10 === 0) {
            onProgress({ ratio: 0.3 * (i / totalFrames), phase: 'decoding' });
        }
    }

    video.src = '';
    URL.revokeObjectURL(url);

    // Decode audio
    let audioBuffer: AudioBuffer | null = null;
    try {
        const arrayBuf = await blob.arrayBuffer();
        const audioCtx = new OfflineAudioContext(2, 1, 48000);
        audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
    } catch {
        audioBuffer = null;
    }

    return {
        videoFrames: frames,
        audioBuffer,
        videoInfo: { width, height, duration },
    };
}
