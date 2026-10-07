import { AudioSampleSink, BlobSource, Input, ALL_FORMATS, type AudioSample } from 'mediabunny';
import { AudioExportError } from './AudioExportError';
export { AudioExportError } from './AudioExportError';
import { probeAudioTrack } from './audioTrackProbe';
import { awaitWithAbort, throwIfAborted } from './mediaWait';

export interface AudioSource {
    sampleRate: number;
    numberOfChannels: number;
    samples: (start: number, end: number) => AsyncGenerator<AudioSample, void, unknown>;
    dispose: () => void;
}

export async function openAudioSource(blob: Blob, signal?: AbortSignal): Promise<AudioSource | null> {
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
        const track = await awaitWithAbort(input.getPrimaryAudioTrack(), signal);
        if (!track) throw new Error('No recognized audio track');
        if (!await awaitWithAbort(track.canDecode(), signal)) throw new AudioExportError('decodeFailed');
        const sampleRate = await awaitWithAbort(track.getSampleRate(), signal);
        const numberOfChannels = await awaitWithAbort(track.getNumberOfChannels(), signal);
        const sink = new AudioSampleSink(track);
        throwIfAborted(signal);
        return { sampleRate, numberOfChannels, samples: (start, end) => sink.samples(start, end), dispose };
    } catch {
        dispose();
        throwIfAborted(signal);
        // A parser/decoder failure must never silently discard an audio track.
        if (await awaitWithAbort(probeAudioTrack(blob), signal) === false) return null;
        throw new AudioExportError('decodeFailed');
    }
}
