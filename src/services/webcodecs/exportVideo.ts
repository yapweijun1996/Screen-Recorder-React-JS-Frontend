import { ALL_FORMATS, WEBM, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';
import { awaitWithAbort, throwIfAborted } from './mediaWait';

export interface VideoSource {
    width: number;
    height: number;
    samples: (timestamps: Iterable<number>) => AsyncGenerator<VideoSample | null, void, unknown>;
    dispose: () => void;
}

/** Sample a streaming recording in presentation order without relying on timestamp seeks. */
export async function* sampleSequentialVideo(
    openSamples: (start: number) => AsyncGenerator<VideoSample, void, unknown>,
    timestamps: Iterable<number>,
): AsyncGenerator<VideoSample | null, void, unknown> {
    const requests = timestamps[Symbol.iterator]();
    let request = requests.next();
    while (!request.done) {
        const decoder = openSamples(request.value);
        let current: VideoSample | null = null;
        let next: VideoSample | null = null;
        try {
            const first = await decoder.next();
            if (first.done) return;
            current = first.value;
            const following = await decoder.next();
            next = following.done ? null : following.value;
            while (!request.done) {
                const timestamp = request.value;
                while (next && next.timestamp <= timestamp) {
                    current.close();
                    current = next;
                    next = null;
                    const decoded = await decoder.next();
                    if (!decoded.done) next = decoded.value;
                }
                // Hold the previous picture between frames and under an audio tail.
                yield current.timestamp <= timestamp ? current.clone() : null;
                request = requests.next();
                // Overlapping export ranges can rewind source time between cuts.
                if (!request.done && request.value < timestamp) break;
            }
        } finally {
            current?.close();
            next?.close();
            await decoder.return();
        }
    }
}

export async function openVideoSource(blob: Blob, signal?: AbortSignal): Promise<VideoSource> {
    throwIfAborted(signal);
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob, { maxCacheSize: 8 * 1024 * 1024 }) });
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        signal?.removeEventListener('abort', dispose);
        input.dispose();
    };
    signal?.addEventListener('abort', dispose, { once: true });
    try {
        const track = await awaitWithAbort(input.getPrimaryVideoTrack(), signal);
        if (!track || !await awaitWithAbort(track.canDecode(), signal)) throw new Error('Video track cannot be decoded');
        const width = await awaitWithAbort(track.getDisplayWidth(), signal);
        const height = await awaitWithAbort(track.getDisplayHeight(), signal);
        const firstTimestamp = await awaitWithAbort(track.getFirstTimestamp(), signal);
        const format = await awaitWithAbort(input.getFormat(), signal);
        // MediaRecorder WebM can omit a declared duration and fail timestamp
        // lookups between clusters even though sequential decoding is valid.
        const sequential = format === WEBM && await awaitWithAbort(track.getDurationFromMetadata(), signal) === null;
        const sink = new VideoSampleSink(track);
        throwIfAborted(signal);
        return {
            width, height, dispose,
            samples: timestamps => {
                const normalized = (function* () {
                    for (const timestamp of timestamps) {
                        // Allow microsecond rounding and hold the first frame across a leading gap.
                        yield Math.max(firstTimestamp, timestamp + 1 / 1_000_000);
                    }
                })();
                return sequential
                    ? sampleSequentialVideo(start => sink.samples(start), normalized)
                    : sink.samplesAtTimestamps(normalized);
            },
        };
    } catch (error) {
        dispose();
        throwIfAborted(signal);
        throw error;
    }
}
