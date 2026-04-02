/**
 * WebCodecs-based video export service.
 * Decodes input WebM, trims/concatenates segments, re-encodes to H.264 MP4.
 * Uses mp4-muxer for container packaging.
 *
 * License: MIT (no GPL dependencies)
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { ExportOptions, VideoQualityPreset } from '../../types';
import { VIDEO_QUALITY_PRESETS } from '../../types';

export interface ExportProgress {
    ratio: number; // 0-1
    phase: 'decoding' | 'encoding' | 'muxing';
}

/** Resolution mappings */
const RESOLUTION_MAP: Record<string, { width: number; height: number } | null> = {
    original: null,
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};

/** Map quality preset to H.264 bitrate */
function getVideoBitrate(quality: VideoQualityPreset, width: number, height: number): number {
    const preset = VIDEO_QUALITY_PRESETS[quality];
    // Scale bitrate based on resolution relative to 1080p
    const pixelRatio = (width * height) / (1920 * 1080);
    const scaledBitrate = preset.videoBitsPerSecond * Math.max(0.5, Math.min(3, pixelRatio));
    return Math.round(scaledBitrate);
}

function getAudioBitrate(quality: VideoQualityPreset): number {
    const bitrateStr = VIDEO_QUALITY_PRESETS[quality].audioBitrate;
    return parseInt(bitrateStr) * 1000; // '128k' -> 128000
}

/** Normalize segments: sort, filter invalid */
function normalizeSegments(segments: Array<{ start: number; end: number }>) {
    return segments
        .map((s) => ({ start: Number(s.start), end: Number(s.end) }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
        .sort((a, b) => a.start - b.start);
}

/**
 * Export video using WebCodecs API + mp4-muxer.
 *
 * Flow:
 * 1. Decode input WebM using VideoDecoder/AudioDecoder
 * 2. Filter frames by segment time ranges
 * 3. Re-encode to H.264/AAC using VideoEncoder/AudioEncoder
 * 4. Mux into MP4 container using mp4-muxer
 */
export async function exportWithWebCodecs(
    inputBlob: Blob,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
    const quality = options.quality || 'medium';
    const targetFps = options.fps || 30;
    const resolution = options.resolution || 'original';

    // Determine segments to export
    let segments = options.segments?.length
        ? normalizeSegments(options.segments)
        : (options.trimStart !== undefined && options.trimEnd !== undefined)
            ? normalizeSegments([{ start: options.trimStart, end: options.trimEnd }])
            : null;

    // Demux input video to get raw tracks
    const { videoTrack, audioTrack, videoInfo, audioInfo } = await demuxBlob(inputBlob);

    // Calculate output dimensions
    const resConfig = RESOLUTION_MAP[resolution];
    const outputWidth = resConfig?.width ?? videoInfo.width;
    const outputHeight = resConfig?.height ?? videoInfo.height;
    // Ensure even dimensions (H.264 requires)
    const width = outputWidth % 2 === 0 ? outputWidth : outputWidth + 1;
    const height = outputHeight % 2 === 0 ? outputHeight : outputHeight + 1;

    const videoBitrate = getVideoBitrate(quality, width, height);
    const audioBitrate = getAudioBitrate(quality);
    const hasAudio = audioTrack.length > 0 && audioInfo !== null;

    // Total duration for progress calculation
    const totalDuration = segments
        ? segments.reduce((sum, s) => sum + (s.end - s.start), 0)
        : videoInfo.duration;

    // Create MP4 muxer
    const muxerTarget = new ArrayBufferTarget();
    const muxer = new Muxer({
        target: muxerTarget,
        video: {
            codec: 'avc',
            width,
            height,
        },
        audio: hasAudio ? {
            codec: 'aac',
            numberOfChannels: audioInfo!.numberOfChannels,
            sampleRate: audioInfo!.sampleRate,
        } : undefined,
        fastStart: 'in-memory', // moov atom at beginning for web playback
    });

    // Encode video frames
    let encodedFrames = 0;
    const expectedFrames = Math.ceil(totalDuration * targetFps);

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta ?? undefined);
            encodedFrames++;
            onProgress?.({
                ratio: Math.min(0.95, encodedFrames / Math.max(expectedFrames, 1)),
                phase: 'encoding',
            });
        },
        error: (e) => { throw e; },
    });

    videoEncoder.configure({
        codec: 'avc1.42001f', // H.264 Baseline L3.1
        width,
        height,
        bitrate: videoBitrate,
        framerate: targetFps,
        avc: { format: 'avc' }, // mp4-muxer expects 'avc' format
    });

    // Encode audio if present
    let audioEncoder: AudioEncoder | null = null;
    if (hasAudio) {
        audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
                muxer.addAudioChunk(chunk, meta ?? undefined);
            },
            error: (e) => { throw e; },
        });

        audioEncoder.configure({
            codec: 'mp4a.40.2', // AAC-LC
            numberOfChannels: audioInfo!.numberOfChannels,
            sampleRate: audioInfo!.sampleRate,
            bitrate: audioBitrate,
        });
    }

    // Process video frames through segments
    const frameDuration = 1_000_000 / targetFps; // microseconds
    let outputTimestamp = 0; // continuous output timestamp in microseconds

    if (!segments) {
        // Export full video
        segments = [{ start: 0, end: videoInfo.duration }];
    }

    onProgress?.({ ratio: 0, phase: 'decoding' });

    for (const segment of segments) {
        // Find video frames within this segment
        const segmentFrames = videoTrack.filter(
            (f) => f.timestamp / 1_000_000 >= segment.start - 0.01 &&
                f.timestamp / 1_000_000 < segment.end + 0.01
        );

        // Re-sample at target FPS
        const segDuration = segment.end - segment.start;
        const frameCount = Math.ceil(segDuration * targetFps);

        for (let i = 0; i < frameCount; i++) {
            const targetTime = segment.start + (i / targetFps);
            const targetTimeUs = targetTime * 1_000_000;

            // Find nearest frame
            let best = segmentFrames[0];
            let bestDist = Infinity;
            for (const f of segmentFrames) {
                const dist = Math.abs(f.timestamp - targetTimeUs);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = f;
                }
            }

            if (best) {
                // VideoFrame from ImageBitmap — use overload 1 (CanvasImageSource)
                const frame = new VideoFrame(best.data, {
                    timestamp: outputTimestamp,
                    displayWidth: width,
                    displayHeight: height,
                });

                videoEncoder.encode(frame, { keyFrame: i % (targetFps * 2) === 0 });
                frame.close();
            }

            outputTimestamp += frameDuration;
        }

        // Process audio for this segment
        if (audioEncoder && audioInfo) {
            const segmentAudio = audioTrack.filter(
                (a) => a.timestamp / 1_000_000 >= segment.start - 0.01 &&
                    a.timestamp / 1_000_000 < segment.end + 0.01
            );

            const audioOffset = (segment.start * 1_000_000) - (segmentAudio[0]?.timestamp ?? 0);

            for (const chunk of segmentAudio) {
                const adjustedTimestamp = chunk.timestamp - (segment.start * 1_000_000) +
                    (outputTimestamp - segDuration * 1_000_000);

                const audioData = new AudioData({
                    format: chunk.format,
                    sampleRate: audioInfo.sampleRate,
                    numberOfFrames: chunk.numberOfFrames,
                    numberOfChannels: audioInfo.numberOfChannels,
                    timestamp: Math.max(0, adjustedTimestamp),
                    data: chunk.data,
                });
                audioEncoder.encode(audioData);
                audioData.close();
            }
        }
    }

    // Flush and finalize
    onProgress?.({ ratio: 0.95, phase: 'muxing' });

    await videoEncoder.flush();
    videoEncoder.close();

    if (audioEncoder) {
        await audioEncoder.flush();
        audioEncoder.close();
    }

    muxer.finalize();
    onProgress?.({ ratio: 1, phase: 'muxing' });

    return new Blob([muxerTarget.buffer], { type: 'video/mp4' });
}

// ─── Internal: Demux WebM blob into raw frames ───────────────────────────

interface DecodedVideoFrame {
    timestamp: number; // microseconds
    data: ImageBitmap;
}

interface DecodedAudioChunk {
    timestamp: number; // microseconds
    format: AudioSampleFormat;
    numberOfFrames: number;
    data: ArrayBuffer;
}

interface VideoInfo {
    width: number;
    height: number;
    duration: number; // seconds
}

interface AudioInfo {
    numberOfChannels: number;
    sampleRate: number;
}

interface DemuxResult {
    videoTrack: DecodedVideoFrame[];
    audioTrack: DecodedAudioChunk[];
    videoInfo: VideoInfo;
    audioInfo: AudioInfo | null;
}

/**
 * Demux a video blob by playing it through a hidden <video> element
 * and capturing frames via VideoFrame + OffscreenCanvas.
 */
async function demuxBlob(blob: Blob): Promise<DemuxResult> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video for demuxing'));
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;

    // Extract frames by seeking through the video
    const frames: DecodedVideoFrame[] = [];
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Seek through at fine granularity to extract frames
    const seekInterval = 1 / 30; // ~30fps extraction
    const totalFrames = Math.ceil(duration / seekInterval);

    for (let i = 0; i <= totalFrames; i++) {
        const time = Math.min(i * seekInterval, duration);
        video.currentTime = time;
        await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
        });

        ctx.drawImage(video, 0, 0, width, height);
        const bitmap = await createImageBitmap(canvas);

        frames.push({
            timestamp: time * 1_000_000,
            data: bitmap,
        });
    }

    URL.revokeObjectURL(url);

    // Audio: extract via AudioContext
    let audioTrack: DecodedAudioChunk[] = [];
    let audioInfo: AudioInfo | null = null;

    try {
        const audioCtx = new OfflineAudioContext(2, 1, 48000);
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        if (audioBuffer.numberOfChannels > 0 && audioBuffer.length > 0) {
            audioInfo = {
                numberOfChannels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate,
            };

            // Split audio into chunks (~1024 frames each)
            const chunkSize = 1024;
            const totalChunks = Math.ceil(audioBuffer.length / chunkSize);

            for (let i = 0; i < totalChunks; i++) {
                const offset = i * chunkSize;
                const length = Math.min(chunkSize, audioBuffer.length - offset);

                // Interleave channels into Float32
                const interleaved = new Float32Array(length * audioBuffer.numberOfChannels);
                for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
                    const channelData = audioBuffer.getChannelData(ch);
                    for (let s = 0; s < length; s++) {
                        interleaved[s * audioBuffer.numberOfChannels + ch] = channelData[offset + s];
                    }
                }

                const timestamp = (offset / audioBuffer.sampleRate) * 1_000_000;

                audioTrack.push({
                    timestamp,
                    format: 'f32-planar' as AudioSampleFormat,
                    numberOfFrames: length,
                    data: interleaved.buffer,
                });
            }
        }
    } catch {
        // No audio or decode failed — continue without audio
        audioInfo = null;
        audioTrack = [];
    }

    return {
        videoTrack: frames,
        audioTrack,
        videoInfo: { width, height, duration },
        audioInfo,
    };
}
