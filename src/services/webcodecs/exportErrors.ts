import { AudioExportError } from './AudioExportError';
import type { ExportFormat } from '../../types';
import type { ExportFormatAvailability } from './formatDecision';

export type ExportCodecFailureReason = 'video-codec-unavailable' | 'audio-codec-unavailable';

/** The input could not be opened as a decodable video. */
export class ExportInputError extends Error {
    readonly code = 'invalidInput' as const;

    constructor(public readonly cause?: unknown) {
        super('The selected file could not be decoded as a video.');
        this.name = 'ExportInputError';
    }
}

/** No compatible encoder/container combination exists for the source. */
export class ExportCodecError extends Error {
    readonly code = 'unsupportedCodec' as const;

    constructor(
        public readonly requestedFormat: ExportFormat,
        public readonly reason: ExportCodecFailureReason,
        public readonly availability: ExportFormatAvailability,
        public readonly hasAudio: boolean,
    ) {
        super('No compatible export codec is available for the selected source and format.');
        this.name = 'ExportCodecError';
    }
}

export type ExportFailureKind = 'audio' | 'invalid-input' | 'unsupported-codec' | 'unknown';

export function getExportFailureKind(error: unknown): ExportFailureKind {
    if (error instanceof AudioExportError) return 'audio';
    if (error instanceof ExportInputError) return 'invalid-input';
    if (error instanceof ExportCodecError) return 'unsupported-codec';
    return 'unknown';
}

function translateOrFallback(t: (key: string) => string, key: string, fallbackKey: string): string {
    const value = t(key);
    return value === key ? t(fallbackKey) : value;
}

export const getExportErrorMessage = (
    error: unknown,
    t: (key: string) => string,
    fallbackKey: string,
): string => {
    if (error instanceof AudioExportError) {
        return translateOrFallback(t, `export.audio.${error.code}`, fallbackKey);
    }
    if (error instanceof ExportInputError) {
        return translateOrFallback(t, 'export.input.invalid', fallbackKey);
    }
    if (error instanceof ExportCodecError) {
        return translateOrFallback(t, 'export.codec.unsupported', fallbackKey);
    }
    return t(fallbackKey);
};
