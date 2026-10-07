import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';
import { awaitWithAbort, throwIfAborted } from './mediaWait';

export interface VideoSource {
    width: number;
    height: number;
    samples: (timestamps: Iterable<number>) => AsyncGenerator<VideoSample | null, void, unknown>;
    dispose: () => void;
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
        const sink = new VideoSampleSink(track);
        throwIfAborted(signal);
        return {
            width, height, dispose,
            samples: timestamps => sink.samplesAtTimestamps((function* () {
                for (const timestamp of timestamps) {
                    // Allow microsecond rounding at frame boundaries. Hold the
                    // first frame when a recording starts with a video gap.
                    yield Math.max(firstTimestamp, timestamp + 1 / 1_000_000);
                }
            })()),
        };
    } catch (error) {
        dispose();
        throwIfAborted(signal);
        throw error;
    }
}
