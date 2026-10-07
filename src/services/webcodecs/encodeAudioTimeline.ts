import type { AudioSample } from 'mediabunny';
import type { AudioSource } from './exportAudio';
import { AudioExportError } from './AudioExportError';
import type { TimelineSegment } from './exportTimeline';
import { awaitWithAbort, MEDIA_WAIT_TIMEOUT_MS, throwIfAborted } from './mediaWait';

export const AUDIO_CHUNK_FRAMES = 4096;
export const AUDIO_QUEUE_LIMIT = 4;

async function waitForQueue(encoder: AudioEncoder, signal?: AbortSignal) {
    throwIfAborted(signal);
    if (encoder.state === 'closed') throw new AudioExportError('decodeFailed');
    if (encoder.encodeQueueSize < AUDIO_QUEUE_LIMIT) return;
    await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
            clearTimeout(timer);
            encoder.removeEventListener('dequeue', check);
            signal?.removeEventListener('abort', abort);
            if (error) reject(error); else resolve();
        };
        const check = () => {
            if (encoder.state === 'closed') finish(new AudioExportError('decodeFailed'));
            else if (encoder.encodeQueueSize < AUDIO_QUEUE_LIMIT) finish();
        };
        const abort = () => finish(new DOMException('Export cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('Audio encoder timed out')), MEDIA_WAIT_TIMEOUT_MS);
        encoder.addEventListener('dequeue', check);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort(); else check();
    });
}

/** Copy at most one small PCM block. Decoder and encoder queues provide backpressure. */
export async function encodeAudioTimeline(
    encoder: AudioEncoder,
    source: AudioSource,
    timeline: TimelineSegment[],
    signal?: AbortSignal,
    onProgress?: (ratio: number) => void,
) {
    let blocks = 0;
    const rate = source.sampleRate;
    const totalFrames = Math.round((timeline.at(-1)?.outputEndUs ?? 0) * rate / 1_000_000);
    try {
        for (const segment of timeline) {
            const outputStart = Math.round(segment.outputStartUs * rate / 1_000_000);
            const frameCount = Math.round(segment.outputEndUs * rate / 1_000_000) - outputStart;
            let cursor = 0;
            const emit = async (count: number, sample?: AudioSample, frameOffset = 0) => {
                for (let offset = 0; offset < count; offset += AUDIO_CHUNK_FRAMES) {
                    await waitForQueue(encoder, signal);
                    const length = Math.min(AUDIO_CHUNK_FRAMES, count - offset);
                    const data = new Float32Array(length * source.numberOfChannels);
                    if (sample) {
                        for (let channel = 0; channel < source.numberOfChannels; channel++) {
                            sample.copyTo(data.subarray(channel * length, (channel + 1) * length), {
                                format: 'f32-planar', planeIndex: channel, frameOffset: frameOffset + offset, frameCount: length,
                            });
                        }
                    }
                    const chunk = new AudioData({
                        format: 'f32-planar', sampleRate: rate, numberOfChannels: source.numberOfChannels,
                        numberOfFrames: length, timestamp: Math.round((outputStart + cursor) / rate * 1_000_000), data,
                    });
                    try { encoder.encode(chunk); } finally { chunk.close(); }
                    cursor += length;
                    onProgress?.((outputStart + cursor) / Math.max(1, totalFrames));
                    // A macrotask lets a click reach AbortController even when
                    // decoding is faster than the browser's event loop.
                    if (++blocks % 16 === 0) await awaitWithAbort(new Promise<void>(resolve => setTimeout(resolve, 0)), signal);
                }
            };
            const iterator = source.samples(segment.start, segment.end);
            try {
                while (cursor < frameCount) {
                    const result = await awaitWithAbort(iterator.next(), signal);
                    if (result.done) break;
                    const sample = result.value;
                    try {
                        if (sample.sampleRate !== rate || sample.numberOfChannels !== source.numberOfChannels) throw new AudioExportError('decodeFailed');
                        let offset = Math.max(0, Math.round((segment.start - sample.timestamp) * rate));
                        const position = Math.round((sample.timestamp - segment.start) * rate) + offset;
                        if (position > cursor) await emit(Math.min(position - cursor, frameCount - cursor));
                        if (position < cursor) offset += cursor - position;
                        const length = Math.min(sample.numberOfFrames - offset, frameCount - cursor);
                        if (length > 0) await emit(length, sample, offset);
                    } finally { sample.close(); }
                }
            } finally {
                // Input disposal handles pending reads on abort; don't block
                // cancellation on a decoder that has not delivered its sample.
                const returned = iterator.return();
                if (signal?.aborted) void returned.catch(() => {});
                else await awaitWithAbort(returned, signal);
            }
            // Preserve source offsets and short tracks instead of shifting all
            // later audio earlier. Missing portions are represented by silence.
            if (cursor < frameCount) await emit(frameCount - cursor);
        }
        throwIfAborted(signal);
    } catch (error) {
        throwIfAborted(signal);
        if (error instanceof AudioExportError) throw error;
        throw new AudioExportError('decodeFailed');
    }
}
