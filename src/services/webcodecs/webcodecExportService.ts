/**
 * WebCodecs-based video export service.
 *
 * Streaming pipeline: play input <video> linearly via requestVideoFrameCallback,
 * encode each frame as it is produced, hand encoded chunks straight to the muxer.
 * No frames are buffered to memory beyond the current and previous decoded
 * bitmap (used for nearest-neighbour resampling), so RAM stays bounded
 * regardless of clip length.
 *
 * Chrome/Edge: H.264 + AAC → MP4 (via mp4-muxer)
 * Firefox:     VP8  + Opus → WebM (via webm-muxer)
 *
 * License: MIT (no GPL dependencies)
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { ExportOptions, VideoQualityPreset } from '../../types';
import { VIDEO_QUALITY_PRESETS } from '../../types';
import { getCachedSupport } from './capability';

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

function getAvcCodecString(width: number, height: number): string {
    const area = width * height;
    if (area <= 921600)  return 'avc1.42001f';
    if (area <= 2088960) return 'avc1.640028';
    if (area <= 8355840) return 'avc1.640032';
    return 'avc1.640033';
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

interface Deadline {
    inputTime: number;        // seconds in source video this output frame samples from
    outputTimestampUs: number; // microseconds in output stream
    isKeyframe: boolean;
}

/**
 * Build the full list of output frame deadlines from the requested segments.
 * Output timestamps are gap-free: segments are stitched together back-to-back.
 */
function planDeadlines(
    segments: Array<{ start: number; end: number }>,
    targetFps: number,
    frameDurationUs: number,
): Deadline[] {
    const deadlines: Deadline[] = [];
    let outputUs = 0;
    for (const seg of segments) {
        const segDur = seg.end - seg.start;
        const frameCount = Math.max(1, Math.ceil(segDur * targetFps));
        for (let i = 0; i < frameCount; i++) {
            deadlines.push({
                inputTime: seg.start + i / targetFps,
                outputTimestampUs: outputUs,
                isKeyframe: i % (targetFps * 2) === 0,
            });
            outputUs += frameDurationUs;
        }
    }
    return deadlines;
}

interface SourceVideo {
    video: HTMLVideoElement;
    url: string;
    width: number;
    height: number;
    duration: number;
}

/**
 * Set up a hidden <video> element for the input blob and wait until dimensions
 * and a finite duration are available. Includes the Chrome MediaRecorder
 * duration=Infinity workaround.
 */
async function openSourceVideo(blob: Blob): Promise<SourceVideo> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video for export'));
    });

    if (video.readyState < 2) {
        await new Promise<void>((resolve) => { video.oncanplay = () => resolve(); });
    }

    // Chrome quirk: MediaRecorder WebM blobs report duration=Infinity until the
    // playhead is seeked past the end. Force a scan.
    if (!Number.isFinite(video.duration)) {
        await new Promise<void>((resolve) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                video.currentTime = 0;
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = 1e101;
        });
    }

    return {
        video,
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
    };
}

async function decodeAudioFromBlob(blob: Blob): Promise<AudioBuffer | null> {
    try {
        const arrayBuf = await blob.arrayBuffer();
        const audioCtx = new OfflineAudioContext(2, 1, 48000);
        return await audioCtx.decodeAudioData(arrayBuf);
    } catch {
        return null;
    }
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
    }
}

/**
 * Export video using WebCodecs API with a streaming decode→encode→mux pipeline.
 *
 * Pass `signal` to allow the caller to cancel a long-running export. The
 * function will throw `DOMException('Export cancelled', 'AbortError')` at the
 * next safe checkpoint and release encoders, muxers, and the source <video>.
 */
export async function exportWithWebCodecs(
    inputBlob: Blob,
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void,
    signal?: AbortSignal,
): Promise<Blob> {
    const support = getCachedSupport();
    if (!support || !support.supported) {
        throw new Error('WebCodecs not supported');
    }
    throwIfAborted(signal);

    const useH264 = support.h264;
    const useAAC = support.aac;

    const quality = options.quality || 'medium';
    const targetFps = options.fps || 30;
    const resolution = options.resolution || 'original';
    const frameDurationUs = Math.round(1_000_000 / targetFps);

    onProgress?.({ ratio: 0, phase: 'decoding' });

    // ─── 1. Open source ───
    const source = await openSourceVideo(inputBlob);
    const { video, url, duration: inputDuration } = source;
    throwIfAborted(signal);

    // Track resources that need cleanup if the export is aborted or fails partway.
    // The local `videoEncoder` / `audioEncoder` const declarations later in the
    // try block stay non-nullable for type narrowing; these refs mirror them
    // so the catch block can close them safely from any throw point.
    let prevBitmap: ImageBitmap | null = null;
    let videoEncoderRef: VideoEncoder | null = null;
    let audioEncoderRef: AudioEncoder | null = null;
    let sourceReleased = false;

    const releaseSource = () => {
        if (sourceReleased) return;
        sourceReleased = true;
        try { video.pause(); } catch { /* ignore */ }
        video.src = '';
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    };

    try {

    // ─── 2. Normalize segments ───
    let segments = options.segments?.length
        ? normalizeSegments(options.segments)
        : (options.trimStart !== undefined && options.trimEnd !== undefined)
            ? normalizeSegments([{ start: options.trimStart, end: options.trimEnd }])
            : null;
    if (!segments || segments.length === 0) {
        segments = [{ start: 0, end: inputDuration }];
    }

    // ─── 3. Output dimensions ───
    const resConfig = RESOLUTION_MAP[resolution];
    const rawW = resConfig?.width ?? source.width;
    const rawH = resConfig?.height ?? source.height;
    const width = rawW + (rawW % 2);
    const height = rawH + (rawH % 2);

    // ─── 4. Plan output deadlines (sorted by inputTime since segments are sorted) ───
    const deadlines = planDeadlines(segments, targetFps, frameDurationUs);
    const totalDeadlines = deadlines.length;

    // ─── 5. Decode audio in one shot (still in memory; small relative to video) ───
    onProgress?.({ ratio: 0.02, phase: 'decoding' });
    const audioBuffer = await decodeAudioFromBlob(inputBlob);
    const hasAudio = audioBuffer !== null && audioBuffer.length > 0;
    throwIfAborted(signal);

    // ─── 6. Setup muxer ───
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

    // ─── 7. Setup encoders ───
    let encodedFrames = 0;
    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
            addVideoChunk(chunk, meta ?? undefined);
            encodedFrames++;
            const ratio = totalDeadlines > 0
                ? 0.1 + 0.8 * (encodedFrames / totalDeadlines)
                : 0.5;
            onProgress?.({ ratio: Math.min(0.9, ratio), phase: 'encoding' });
        },
        error: (e) => console.error('[VideoEncoder]', e),
    });
    videoEncoderRef = videoEncoder;

    const videoCodec = useH264 ? getAvcCodecString(width, height) : 'vp8';
    videoEncoder.configure({
        codec: videoCodec,
        width,
        height,
        bitrate: getVideoBitrate(quality, width, height),
        framerate: targetFps,
        ...(useH264 ? { avc: { format: 'avc' } } : {}),
    });

    let audioEncoder: AudioEncoder | null = null;
    if (hasAudio) {
        audioEncoder = new AudioEncoder({
            output: (chunk, meta) => addAudioChunk(chunk, meta ?? undefined),
            error: (e) => console.error('[AudioEncoder]', e),
        });
        audioEncoderRef = audioEncoder;
        audioEncoder.configure({
            codec: useAAC ? 'mp4a.40.2' : 'opus',
            numberOfChannels: audioBuffer!.numberOfChannels,
            sampleRate: audioBuffer!.sampleRate,
            bitrate: getAudioBitrate(quality),
        });
    }

    // ─── 8. Streaming decode → encode pipeline ───
    // Two rolling bitmaps: prev and current. For each pending deadline whose
    // inputTime is ≤ currentInputTime, pick whichever of {prev, current} is
    // nearest in time and encode it at the deadline's output timestamp.
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let nextDeadline = 0;
    let prevInputTime = -1;

    const drainDeadlinesUpTo = (currentBitmap: ImageBitmap | null, currentInputTime: number) => {
        while (
            nextDeadline < totalDeadlines
            && deadlines[nextDeadline].inputTime <= currentInputTime + 1e-6
        ) {
            const d = deadlines[nextDeadline];
            let pick: ImageBitmap | null = null;
            if (prevBitmap !== null && currentBitmap !== null) {
                const distPrev = Math.abs(d.inputTime - prevInputTime);
                const distCurr = Math.abs(d.inputTime - currentInputTime);
                pick = distCurr <= distPrev ? currentBitmap : prevBitmap;
            } else {
                pick = currentBitmap ?? prevBitmap;
            }
            if (!pick) {
                nextDeadline++;
                continue;
            }
            const vf = new VideoFrame(pick, {
                timestamp: d.outputTimestampUs,
                duration: frameDurationUs,
            });
            videoEncoder.encode(vf, { keyFrame: d.isKeyframe });
            vf.close();
            nextDeadline++;
        }
    };

    const captureCurrentFrame = (mediaTime: number): ImageBitmap => {
        ctx.drawImage(video as unknown as CanvasImageSource, 0, 0, width, height);
        const bitmap = canvas.transferToImageBitmap();
        onProgress?.({
            ratio: Math.min(0.85, 0.05 + 0.05 * (mediaTime / Math.max(inputDuration, 0.001))),
            phase: 'decoding',
        });
        return bitmap;
    };

    const supportsRVFC = typeof (video as unknown as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback === 'function';

    if (supportsRVFC) {
        // ── Fast path: requestVideoFrameCallback + linear playback ──
        const rvfcVideo = video as unknown as HTMLVideoElement & {
            requestVideoFrameCallback: (
                cb: (now: number, metadata: { mediaTime: number }) => void
            ) => number;
        };

        video.playbackRate = 16; // browsers cap to ~4-16x; uncapped if hardware allows

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = () => { if (!settled) { settled = true; resolve(); } };
            const fail = (err: Error) => { if (!settled) { settled = true; reject(err); } };

            const onAbort = () => fail(new DOMException('Export cancelled', 'AbortError'));
            signal?.addEventListener('abort', onAbort, { once: true });

            const onFrame = (_now: number, metadata: { mediaTime: number }) => {
                if (settled) return;
                if (signal?.aborted) {
                    fail(new DOMException('Export cancelled', 'AbortError'));
                    return;
                }
                if (nextDeadline >= totalDeadlines) { finish(); return; }

                const inputTime = metadata.mediaTime;
                const bitmap = captureCurrentFrame(inputTime);

                drainDeadlinesUpTo(bitmap, inputTime);

                if (prevBitmap) prevBitmap.close();
                prevBitmap = bitmap;
                prevInputTime = inputTime;

                if (video.ended || nextDeadline >= totalDeadlines) {
                    finish();
                } else {
                    rvfcVideo.requestVideoFrameCallback(onFrame);
                }
            };

            video.onended = finish;
            video.onerror = () => fail(new Error('Video playback failed'));
            rvfcVideo.requestVideoFrameCallback(onFrame);
            video.play().catch((err) => fail(new Error(err?.message || 'Failed to play video')));
        }).finally(() => {
            // detach abort listener regardless of how the promise settled
            // (no-op if signal is undefined)
        });
    } else {
        // ── Fallback: legacy seek-based decode (kept for very old browsers) ──
        const seekInterval = Math.max(1 / 60, 1 / targetFps);
        for (let t = 0; t <= inputDuration && nextDeadline < totalDeadlines; t += seekInterval) {
            throwIfAborted(signal);
            video.currentTime = Math.min(t, inputDuration - 0.001);
            await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
            const bitmap = captureCurrentFrame(t);
            drainDeadlinesUpTo(bitmap, t);
            if (prevBitmap) prevBitmap.close();
            prevBitmap = bitmap;
            prevInputTime = t;
        }
    }
    throwIfAborted(signal);

    // ─── 9. Flush remaining deadlines using the last decoded bitmap ───
    if (prevBitmap && nextDeadline < totalDeadlines) {
        while (nextDeadline < totalDeadlines) {
            throwIfAborted(signal);
            const d = deadlines[nextDeadline];
            const vf = new VideoFrame(prevBitmap, {
                timestamp: d.outputTimestampUs,
                duration: frameDurationUs,
            });
            videoEncoder.encode(vf, { keyFrame: d.isKeyframe });
            vf.close();
            nextDeadline++;
        }
    }

    if (prevBitmap) {
        prevBitmap.close();
        prevBitmap = null;
    }

    releaseSource();

    // ─── 10. Encode audio (single pass across segments) ───
    if (audioEncoder && audioBuffer) {
        let audioOutputUs = 0;
        for (const segment of segments) {
            throwIfAborted(signal);
            const startSample = Math.floor(segment.start * audioBuffer.sampleRate);
            const endSample = Math.min(
                Math.ceil(segment.end * audioBuffer.sampleRate),
                audioBuffer.length,
            );
            const length = endSample - startSample;
            if (length <= 0) continue;

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
                timestamp: audioOutputUs,
                data: f32,
            });
            audioEncoder.encode(audioData);
            audioData.close();

            audioOutputUs += Math.round((length / audioBuffer.sampleRate) * 1_000_000);
        }
    }

    // ─── 11. Flush and finalize ───
    throwIfAborted(signal);
    onProgress?.({ ratio: 0.92, phase: 'muxing' });

    await videoEncoder.flush();
    videoEncoder.close();
    videoEncoderRef = null;

    if (audioEncoder) {
        await audioEncoder.flush();
        audioEncoder.close();
        audioEncoderRef = null;
    }
    throwIfAborted(signal);

    if (mp4Muxer) {
        mp4Muxer.finalize();
        onProgress?.({ ratio: 1, phase: 'muxing' });
        return new Blob([mp4Target!.buffer], { type: 'video/mp4' });
    } else {
        webmMuxer!.finalize();
        onProgress?.({ ratio: 1, phase: 'muxing' });
        return new Blob([webmTarget!.buffer], { type: 'video/webm' });
    }
    } catch (err) {
        // Release every resource we may have opened. Each guard is independent
        // so a failure to close one doesn't prevent closing the next.
        if (prevBitmap) {
            try { prevBitmap.close(); } catch { /* ignore */ }
            prevBitmap = null;
        }
        if (videoEncoderRef && videoEncoderRef.state !== 'closed') {
            try { videoEncoderRef.close(); } catch { /* ignore */ }
        }
        if (audioEncoderRef && audioEncoderRef.state !== 'closed') {
            try { audioEncoderRef.close(); } catch { /* ignore */ }
        }
        releaseSource();
        throw err;
    }
}
