/**
 * WebCodecs-based video export service.
 *
 * Streaming pipeline: demux and decode requested video timestamps, then hand
 * encoded chunks straight to the muxer. Decoder prefetch and encoder queues
 * apply backpressure; display refresh never determines the exported frames.
 * Audio is read in bounded blocks; compressed output and container metadata
 * still grow with clip length.
 *
 * Chrome/Edge: H.264 + AAC → MP4 (via mp4-muxer)
 * Firefox:     VP8  + Opus → WebM (via webm-muxer)
 *
 * Muxers: MIT. Media decoder: Mediabunny (MPL-2.0).
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { ExportOptions } from '../../types';
import { getExportDimensions, getAudioBitrate, normalizeSegments, openSourceVideo, throwIfAborted } from './exportHelpers';
import type { AudioSource } from './exportAudio';
import type { VideoSource } from './exportVideo';
import { AudioExportError } from './AudioExportError';
import { awaitWithAbort, awaitWithTimeout, MEDIA_WAIT_TIMEOUT_MS } from './mediaWait';
import { createTimeline, planDeadlines, type Deadline } from './exportTimeline';
import { encodeAudioTimeline } from './encodeAudioTimeline';
import { encodeVideoFrames } from './encodeVideoFrames';
import { getCachedSupport } from './capability';

export interface ExportProgress {
    ratio: number;
    phase: 'decoding' | 'encoding' | 'muxing';
}

export interface WebCodecsExportResult {
    blob: Blob;
    format: 'mp4' | 'webm' | 'audio';
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
): Promise<WebCodecsExportResult> {
    const support = getCachedSupport();
    if (!support || !support.supported) {
        throw new Error('WebCodecs not supported');
    }
    throwIfAborted(signal);

    const quality = options.quality || 'medium';
    const targetFps = options.fps || 30;
    const resolution = options.resolution || 'original';

    onProgress?.({ ratio: 0, phase: 'decoding' });

    // ─── 1. Open source ───
    const source = await openSourceVideo(inputBlob, signal);
    const { release: releaseSource, duration: inputDuration } = source;

    // The audio encoder belongs to this coordinator; video resources are local
    // to encodeVideoFrames so each phase can clean up independently.
    let audioEncoderRef: AudioEncoder | null = null;
    let audioSource: AudioSource | null = null;
    let videoSource: VideoSource | null = null;
    let audioError: DOMException | null = null;
    signal?.addEventListener('abort', releaseSource, { once: true });

    try {
        throwIfAborted(signal);
        // ─── 2. Normalize segments ───
        let segments = options.segments?.length
            ? normalizeSegments(options.segments)
            : (options.trimStart !== undefined && options.trimEnd !== undefined)
                ? normalizeSegments([{ start: options.trimStart, end: options.trimEnd }])
                : null;
        if (!segments || segments.length === 0) {
            segments = [{ start: 0, end: inputDuration }];
        }

        const timeline = createTimeline(segments, inputDuration);
        if (!timeline.length) throw new Error('No valid export segments');

        // Inspect audio metadata now; decode only the requested ranges later.
        onProgress?.({ ratio: 0.02, phase: 'decoding' });
        const { openAudioSource } = await awaitWithAbort(import('./exportAudio'), signal);
        audioSource = await openAudioSource(inputBlob, signal);
        const hasAudio = audioSource !== null;
        throwIfAborted(signal);

        const requestedFormat = options.format || 'mp4';
        const isAudioOnly = requestedFormat === 'audio';
        if (isAudioOnly && !hasAudio) {
            throw new AudioExportError('noTrack');
        }

        // Keep current behavior for full/trimmed video exports: fail if no
        // compatible muxer+codec combination exists.
        const canUseMp4 = support.h264 && (!hasAudio || support.aac);
        const canUseWebm = support.vp8 && (!hasAudio || support.opus);
        const canUseMp4Audio = support.aac;
        const canUseWebmAudio = support.opus;

        const useMp4 = isAudioOnly
            ? canUseMp4Audio
            : requestedFormat === 'mp4' ? canUseMp4 : !canUseWebm && canUseMp4;
        const useWebm = isAudioOnly
            ? (!useMp4 && canUseWebmAudio)
            : requestedFormat === 'webm' ? canUseWebm : !useMp4 && canUseWebm;

        if (!useMp4 && !useWebm) {
            throw new Error('No supported codec combination is available for export.');
        }

        // ─── 4. Optional video pipeline setup ───
        let width = source.width;
        let height = source.height;
        let deadlines: Deadline[] = [];

        if (!isAudioOnly) {
            const { openVideoSource } = await awaitWithAbort(import('./exportVideo'), signal);
            videoSource = await openVideoSource(inputBlob, signal);
            ({ width, height } = getExportDimensions(videoSource.width, videoSource.height, resolution));

            // ─── 4b. Plan output deadlines (sorted by inputTime since segments are sorted) ───
            deadlines = planDeadlines(timeline, targetFps);
        }

        // ─── 5. Setup muxer ───
        let mp4Muxer: Mp4Muxer<Mp4Target> | null = null;
        let webmMuxer: WebmMuxer<WebmTarget> | null = null;
        let mp4Target: Mp4Target | null = null;
        let webmTarget: WebmTarget | null = null;

        const mp4AudioTrack = audioSource ? {
            audio: {
                codec: 'aac' as const,
                numberOfChannels: audioSource.numberOfChannels,
                sampleRate: audioSource.sampleRate,
            },
        } : null;

        const webmAudioTrack = audioSource ? {
            audio: {
                codec: 'Opus',
                numberOfChannels: audioSource.numberOfChannels,
                sampleRate: audioSource.sampleRate,
            },
        } : null;

        if (useMp4) {
            mp4Target = new Mp4Target();
            mp4Muxer = new Mp4Muxer({
                target: mp4Target,
                ...(isAudioOnly ? {} : { video: { codec: 'avc', width, height } }),
                ...(mp4AudioTrack || {}),
                fastStart: isAudioOnly ? false : 'in-memory',
            });
        } else {
            webmTarget = new WebmTarget();
            webmMuxer = new WebmMuxer({
                target: webmTarget,
                ...(isAudioOnly ? {} : { video: { codec: 'V_VP8', width, height } }),
                ...(webmAudioTrack || {}),
            });
        }

        const addVideoChunk = (chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined, durationUs: number) => {
            if (mp4Muxer) {
                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                mp4Muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, durationUs, meta);
            }
            else if (webmMuxer) webmMuxer.addVideoChunk(chunk, meta, chunk.timestamp);
        };
        const addAudioChunk = (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
            if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta, chunk.timestamp);
            else if (webmMuxer) webmMuxer.addAudioChunk(chunk, meta, chunk.timestamp);
        };

        // ─── 6. Setup encoders ───
        let audioEncoder: AudioEncoder | null = null;
        if (audioSource) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => addAudioChunk(chunk, meta ?? undefined),
                error: (error) => { audioError = error; },
            });
            audioEncoderRef = audioEncoder;
            audioEncoder.configure({
                codec: useMp4 ? 'mp4a.40.2' : 'opus',
                numberOfChannels: audioSource.numberOfChannels,
                sampleRate: audioSource.sampleRate,
                bitrate: getAudioBitrate(quality),
            });
        }

        if (videoSource) {
            await encodeVideoFrames({
                source: videoSource, width, height, deadlines,
                quality, targetFps, useMp4, addVideoChunk, onProgress, signal,
            });
            videoSource.dispose();
        }

        releaseSource();

        if (audioEncoder && audioSource) {
            onProgress?.({ ratio: isAudioOnly ? 0.4 : 0.92, phase: 'muxing' });
            await encodeAudioTimeline(audioEncoder, audioSource, timeline, signal, ratio => {
                onProgress?.({ ratio: isAudioOnly ? 0.05 + ratio * 0.9 : 0.92 + ratio * 0.07, phase: 'encoding' });
            });
            if (audioError) throw new AudioExportError('decodeFailed');
        }

        // ─── 10. Flush audio and finalize ───
        throwIfAborted(signal);
        if (audioEncoder) {
            await awaitWithTimeout(audioEncoder.flush(), MEDIA_WAIT_TIMEOUT_MS, 'Audio encoder timed out', signal);
            if (audioError) throw new AudioExportError('decodeFailed');
            audioEncoder.close();
            audioEncoderRef = null;
        }
        throwIfAborted(signal);

        if (isAudioOnly) {
            if (mp4Muxer) {
                mp4Muxer.finalize();
                onProgress?.({ ratio: 1, phase: 'muxing' });
                return { blob: new Blob([mp4Target!.buffer], { type: 'audio/mp4' }), format: 'audio' };
            }
            webmMuxer!.finalize();
            onProgress?.({ ratio: 1, phase: 'muxing' });
            return { blob: new Blob([webmTarget!.buffer], { type: 'audio/webm' }), format: 'audio' };
        }

        if (mp4Muxer) {
            mp4Muxer.finalize();
            onProgress?.({ ratio: 1, phase: 'muxing' });
            return { blob: new Blob([mp4Target!.buffer], { type: 'video/mp4' }), format: 'mp4' };
        } else {
            webmMuxer!.finalize();
            onProgress?.({ ratio: 1, phase: 'muxing' });
            return { blob: new Blob([webmTarget!.buffer], { type: 'video/webm' }), format: 'webm' };
        }

    } catch (err) {
        // Release every resource we may have opened. Each guard is independent
        // so a failure to close one doesn't prevent closing the next.
        if (audioEncoderRef && audioEncoderRef.state !== 'closed') {
            try { audioEncoderRef.close(); } catch { /* ignore */ }
        }
        releaseSource();
        throw err;
    } finally {
        videoSource?.dispose();
        audioSource?.dispose();
        signal?.removeEventListener('abort', releaseSource);
        releaseSource();
    }
}
