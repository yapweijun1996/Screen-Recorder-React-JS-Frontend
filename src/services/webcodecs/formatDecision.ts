import type { ExportFormat } from '../../types';
import type { WebCodecsSupport } from './capability';
import { ExportCodecError, type ExportCodecFailureReason } from './exportErrors';

export type ExportContainer = 'mp4' | 'webm';
export type VideoExportCodec = 'avc' | 'vp8';
export type AudioExportCodec = 'aac' | 'opus';

/**
 * The one source of truth for the container and codec selected by an export.
 * `format` is the public result format; `container` remains useful for audio-only output.
 */
export interface ExportFormatDecision {
    requestedFormat: ExportFormat;
    format: ExportFormat;
    container: ExportContainer;
    videoCodec?: VideoExportCodec;
    audioCodec?: AudioExportCodec;
    hasAudio: boolean;
    fallbackReason: ExportCodecFailureReason | null;
}

export interface ExportFormatAvailability {
    mp4: boolean;
    webm: boolean;
    audio: boolean;
    mp4Video: boolean;
    mp4Audio: boolean;
    webmVideo: boolean;
    webmAudio: boolean;
}

/** Return capabilities for a source whose audio presence is known (or unknown). */
export function getExportFormatAvailability(
    support: WebCodecsSupport,
    hasAudio = false,
): ExportFormatAvailability {
    const mp4Video = support.h264;
    const mp4Audio = support.aac;
    const webmVideo = support.vp8;
    const webmAudio = support.opus;
    return {
        mp4Video,
        mp4Audio,
        webmVideo,
        webmAudio,
        mp4: mp4Video && (!hasAudio || mp4Audio),
        webm: webmVideo && (!hasAudio || webmAudio),
        audio: mp4Audio || webmAudio,
    };
}

function unavailableReason(
    requestedFormat: ExportFormat,
    support: WebCodecsSupport,
    hasAudio: boolean,
): ExportCodecFailureReason {
    if (requestedFormat === 'audio') return 'audio-codec-unavailable';
    if (requestedFormat === 'mp4') {
        if (!support.h264) return 'video-codec-unavailable';
        if (hasAudio && !support.aac) return 'audio-codec-unavailable';
    } else if (!support.vp8) {
        return 'video-codec-unavailable';
    } else if (hasAudio && !support.opus) {
        return 'audio-codec-unavailable';
    }
    return 'video-codec-unavailable';
}

/**
 * Resolve the requested format once. The muxer and the result metadata must use
 * this same decision, otherwise a fallback can produce truthful bytes but a
 * misleading filename or download label.
 */
export function resolveExportFormat(
    requestedFormat: ExportFormat,
    hasAudio: boolean,
    support: WebCodecsSupport,
): ExportFormatDecision {
    const availability = getExportFormatAvailability(support, hasAudio);

    if (requestedFormat === 'audio') {
        if (availability.mp4Audio) {
            return {
                requestedFormat, format: 'audio', container: 'mp4', audioCodec: 'aac', hasAudio,
                fallbackReason: null,
            };
        }
        if (availability.webmAudio) {
            return {
                requestedFormat, format: 'audio', container: 'webm', audioCodec: 'opus', hasAudio,
                fallbackReason: 'audio-codec-unavailable',
            };
        }
        throw new ExportCodecError(requestedFormat, 'audio-codec-unavailable', availability, hasAudio);
    }

    const preferred: ExportContainer = requestedFormat === 'webm' ? 'webm' : 'mp4';
    const alternate: ExportContainer = preferred === 'mp4' ? 'webm' : 'mp4';
    const selected = availability[preferred] ? preferred : availability[alternate] ? alternate : null;
    if (!selected) {
        throw new ExportCodecError(
            requestedFormat,
            unavailableReason(requestedFormat, support, hasAudio),
            availability,
            hasAudio,
        );
    }

    const isMp4 = selected === 'mp4';
    return {
        requestedFormat,
        format: selected,
        container: selected,
        videoCodec: isMp4 ? 'avc' : 'vp8',
        ...(hasAudio ? { audioCodec: isMp4 ? 'aac' : 'opus' } : {}),
        hasAudio,
        fallbackReason: selected === preferred ? null : unavailableReason(requestedFormat, support, hasAudio),
    };
}
