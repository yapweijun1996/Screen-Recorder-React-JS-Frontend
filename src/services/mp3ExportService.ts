import {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    canEncodeAudio,
    Conversion,
    ConversionCanceledError,
    Input,
    Mp3OutputFormat,
    Output,
} from 'mediabunny';
import type { VideoQualityPreset } from '../types';
import { VIDEO_QUALITY_PRESETS } from '../types';
import { AudioExportError } from './webcodecs/AudioExportError';
import { awaitWithAbort, throwIfAborted } from './webcodecs/mediaWait';
import { probeAudioTrack } from './webcodecs/audioTrackProbe';

export interface Mp3ExportResult {
    blob: Blob;
    format: 'mp3';
}

interface ExportProgress {
    ratio: number;
}

const MP3_MIME_TYPE = 'audio/mpeg';
const INPUT_CACHE_SIZE = 8 * 1024 * 1024;

// Registration is global in Mediabunny. Reuse one lazy import when multiple
// conversions start close together instead of loading the WASM encoder twice.
let mp3EncoderRegistration: Promise<void> | null = null;

async function ensureMp3Encoder(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    let nativeEncoderAvailable = false;
    try {
        nativeEncoderAvailable = await awaitWithAbort(canEncodeAudio('mp3'), signal);
    } catch (error) {
        throwIfAborted(signal);
        // A browser without WebCodecs should use the bundled LAME extension.
        // The conversion below still reports an encoding error if it cannot be
        // registered or used.
    }

    if (nativeEncoderAvailable) return;
    if (!mp3EncoderRegistration) {
        mp3EncoderRegistration = import('@mediabunny/mp3-encoder')
            .then(({ registerMp3Encoder }) => registerMp3Encoder())
            .catch((error) => {
                mp3EncoderRegistration = null;
                throw error;
            });
    }
    await awaitWithAbort(mp3EncoderRegistration, signal);
}

function getAudioBitrate(quality: VideoQualityPreset): number {
    const bitrateKbps = Number.parseInt(VIDEO_QUALITY_PRESETS[quality].audioBitrate, 10);
    if (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0) {
        throw new AudioExportError('encodeFailed');
    }
    return bitrateKbps * 1000;
}

function isAudioDiscarded(conversion: Conversion): 'decodeFailed' | 'encodeFailed' | null {
    const audioTrack = conversion.discardedTracks.find(({ track }) => track.type === 'audio');
    if (!audioTrack) return null;
    if (audioTrack.reason === 'undecodable_source_codec') return 'decodeFailed';
    if (audioTrack.reason === 'no_encodable_target_codec') return 'encodeFailed';
    return null;
}

function mapConversionError(error: unknown): Error {
    if (error instanceof AudioExportError || error instanceof DOMException) return error;
    if (error instanceof ConversionCanceledError) return new AudioExportError('encodeFailed');
    return new AudioExportError('encodeFailed');
}

/**
 * Convert the primary audio track to MP3 in the browser.
 *
 * Mediabunny owns the bounded decode/encode queues. The optional MP3 extension
 * is loaded only when the browser does not expose a native MP3 encoder.
 */
export async function exportMp3(
    inputBlob: Blob,
    quality: VideoQualityPreset,
    signal: AbortSignal,
    onProgress: (progress: ExportProgress) => void,
): Promise<Mp3ExportResult> {
    throwIfAborted(signal);
    const bitrate = getAudioBitrate(quality);
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(inputBlob, { maxCacheSize: INPUT_CACHE_SIZE }),
    });
    let conversion: Conversion | null = null;
    let abortHandler: (() => void) | null = null;

    try {
        let audioTrack;
        try {
            audioTrack = await awaitWithAbort(input.getPrimaryAudioTrack(), signal);
        } catch (error) {
            throwIfAborted(signal);
            const probe = await awaitWithAbort(probeAudioTrack(inputBlob), signal);
            if (probe === false) throw new AudioExportError('noTrack');
            throw new AudioExportError('decodeFailed');
        }
        if (!audioTrack) throw new AudioExportError('noTrack');

        try {
            if (!await awaitWithAbort(audioTrack.canDecode(), signal)) {
                throw new AudioExportError('decodeFailed');
            }
        } catch (error) {
            throwIfAborted(signal);
            if (error instanceof AudioExportError) throw error;
            throw new AudioExportError('decodeFailed');
        }

        await ensureMp3Encoder(signal);
        throwIfAborted(signal);

        const target = new BufferTarget();
        const output = new Output({
            format: new Mp3OutputFormat(),
            target,
        });
        conversion = await awaitWithAbort(Conversion.init({
            input,
            output,
            tracks: 'primary',
            copy: false,
            video: { discard: true },
            audio: {
                codec: 'mp3',
                bitrate,
                forceTranscode: true,
            },
            showWarnings: false,
        }), signal);

        const discardedAudio = isAudioDiscarded(conversion);
        if (discardedAudio === 'decodeFailed') throw new AudioExportError('decodeFailed');
        if (discardedAudio === 'encodeFailed') throw new AudioExportError('encodeFailed');
        if (!conversion.utilizedTracks.some(track => track.type === 'audio')) {
            throw new AudioExportError('noTrack');
        }

        conversion.onProgress = (ratio) => {
            if (!signal.aborted) {
                onProgress({ ratio: Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) });
            }
        };
        abortHandler = () => {
            // Conversion.cancel() wakes Mediabunny's pumps and releases its
            // encoder. The caller's signal remains the source of truth for the
            // public AbortError returned below.
            void conversion?.cancel().catch(() => {});
        };
        signal.addEventListener('abort', abortHandler, { once: true });
        if (signal.aborted) {
            abortHandler();
            throwIfAborted(signal);
        }

        await conversion.execute();
        throwIfAborted(signal);
        if (!target.buffer) throw new AudioExportError('encodeFailed');
        return { blob: new Blob([target.buffer], { type: MP3_MIME_TYPE }), format: 'mp3' };
    } catch (error) {
        throwIfAborted(signal);
        if (error instanceof AudioExportError) throw error;
        throw mapConversionError(error);
    } finally {
        if (abortHandler) signal.removeEventListener('abort', abortHandler);
        if (conversion && conversion.state !== 'done' && conversion.state !== 'canceled') {
            try { await conversion.cancel(); } catch { /* release is best effort after a failed conversion */ }
        }
        input.dispose();
    }
}
