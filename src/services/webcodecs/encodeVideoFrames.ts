import type { VideoSample } from 'mediabunny';
import type { VideoQualityPreset } from '../../types';
import type { ExportProgress } from './webcodecExportService';
import type { VideoSource } from './exportVideo';
import { getAvcCodecString, getVideoBitrate, throwIfAborted } from './exportHelpers';
import type { Deadline } from './exportTimeline';
import { awaitWithAbort, MEDIA_WAIT_TIMEOUT_MS } from './mediaWait';

export const VIDEO_QUEUE_LIMIT = 4;

interface VideoEncodingArgs {
    source: VideoSource;
    width: number;
    height: number;
    deadlines: Deadline[];
    quality: VideoQualityPreset;
    targetFps: number;
    useMp4: boolean;
    addVideoChunk: (chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined, durationUs: number) => void;
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
}

async function waitForVideoOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await awaitWithAbort(Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Video decoder or encoder timed out')), MEDIA_WAIT_TIMEOUT_MS);
            }),
        ]), signal);
    } finally { clearTimeout(timer); }
}

async function waitForQueue(encoder: VideoEncoder, signal: AbortSignal) {
    throwIfAborted(signal);
    if (encoder.state === 'closed') throw new Error('Video encoder closed unexpectedly');
    if (encoder.encodeQueueSize < VIDEO_QUEUE_LIMIT) return;
    let check: () => void = () => {};
    try {
        await waitForVideoOperation(new Promise<void>((resolve, reject) => {
            check = () => {
                if (encoder.state === 'closed') reject(new Error('Video encoder closed unexpectedly'));
                else if (encoder.encodeQueueSize < VIDEO_QUEUE_LIMIT) resolve();
            };
            encoder.addEventListener('dequeue', check);
            check();
        }), signal);
    } finally { encoder.removeEventListener('dequeue', check); }
}

/** Decode requested source timestamps; display refresh never controls export fidelity. */
export async function encodeVideoFrames({
    source, width, height, deadlines,
    quality, targetFps, useMp4, addVideoChunk, onProgress, signal,
}: VideoEncodingArgs) {
    throwIfAborted(signal);
    const operation = new AbortController();
    const onAbort = () => operation.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let encoderError: Error | null = null;
    let encodedFrames = 0;
    const pendingDeadlines = new Map<number, Deadline>();
    let encoder: VideoEncoder | null = null;
    let iterator: ReturnType<VideoSource['samples']> | undefined;
    const fail = (error: unknown) => {
        encoderError ??= error instanceof Error ? error : new Error('Video encoding failed');
        // An encoder error must interrupt decoder/queue/flush waits. Resetting
        // after frames were discarded would silently produce an incomplete file.
        operation.abort();
    };
    try {
        encoder = new VideoEncoder({
            output: (chunk, metadata) => {
                if (operation.signal.aborted) return;
                try {
                    const deadline = pendingDeadlines.get(chunk.timestamp);
                    if (!deadline) throw new Error('Video encoder returned an unexpected or duplicate frame');
                    pendingDeadlines.delete(chunk.timestamp);
                    // Native encoders may replace a short cut-ending duration
                    // with a full frame interval. The shared timeline owns it.
                    addVideoChunk(chunk, metadata, deadline.durationUs);
                    encodedFrames++;
                    onProgress?.({ ratio: Math.min(0.9, 0.1 + 0.8 * encodedFrames / deadlines.length), phase: 'encoding' });
                } catch (error) { fail(error); }
            },
            error: fail,
        });
        encoder.configure({
            codec: useMp4 ? getAvcCodecString(width, height) : 'vp8',
            width, height, bitrate: getVideoBitrate(quality, width, height),
            framerate: targetFps, ...(useMp4 ? { avc: { format: 'avc' } } : {}),
        });
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Cannot create export canvas');
        iterator = source.samples((function* () {
            for (const deadline of deadlines) yield deadline.inputTime;
        })());
        for (let index = 0; index < deadlines.length; index++) {
            throwIfAborted(operation.signal);
            const sampleRef: { current: VideoSample | null } = { current: null };
            try {
                const pending = iterator.next().then(result => {
                    // A decoder may finish after our abort/timeout. Its late
                    // sample still belongs to this operation and must close.
                    if (!result.done) {
                        if (operation.signal.aborted) result.value?.close();
                        else sampleRef.current = result.value;
                    }
                    return result;
                });
                const result = await waitForVideoOperation(pending, operation.signal);
                if (result.done || !result.value) throw new Error('Missing decoded video frame');
                await waitForQueue(encoder, operation.signal);
                context.fillStyle = '#000';
                context.fillRect(0, 0, width, height);
                result.value.drawWithFit(context, { fit: 'contain' });
                const deadline = deadlines[index];
                const frame = new VideoFrame(canvas, { timestamp: deadline.outputTimestampUs, duration: deadline.durationUs });
                pendingDeadlines.set(deadline.outputTimestampUs, deadline);
                try { encoder.encode(frame, { keyFrame: deadline.isKeyframe }); }
                finally { frame.close(); }
            } finally { sampleRef.current?.close(); }
            // Give cancellation clicks a turn even with synchronous decoders.
            if ((index + 1) % 16 === 0) await waitForVideoOperation(new Promise<void>(resolve => setTimeout(resolve, 0)), operation.signal);
        }
        throwIfAborted(operation.signal);
        await waitForVideoOperation(encoder.flush(), operation.signal);
        throwIfAborted(operation.signal);
        if (encodedFrames !== deadlines.length || pendingDeadlines.size) throw new Error('Video encoder did not output every requested frame');
    } catch (error) {
        operation.abort();
        throwIfAborted(signal);
        throw encoderError ?? error;
    } finally {
        try {
            if (encoder && encoder.state !== 'closed') encoder.close();
            if (iterator) {
                const returned = iterator.return();
                if (operation.signal.aborted) void returned.catch(() => {});
                else await waitForVideoOperation(returned, operation.signal);
            }
        } finally { signal?.removeEventListener('abort', onAbort); }
    }
}
