import type { ExportOptions } from '../../types';

/** Resolution mappings for export scaling */
const RESOLUTION_MAP: Record<string, { width: number; height: number } | null> = {
    original: null, // No scaling
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};

/**
 * Convert @ffmpeg/ffmpeg FileData (may be backed by SharedArrayBuffer) into an ArrayBuffer-backed Uint8Array,
 * so it can be safely used as a BlobPart without TS type issues.
 */
export const toArrayBufferUint8 = (data: Uint8Array): Uint8Array<ArrayBuffer> => {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    return new Uint8Array(ab);
};

/**
 * Build video filters used for BOTH single-trim and multi-segment concat.
 * - Keep logic centralized to avoid duplicated hardcoded strings.
 */
export const buildVideoFilterString = (options: ExportOptions) => {
    const resolution = options.resolution || 'original';
    const resConfig = RESOLUTION_MAP[resolution];
    const targetFps = Number.isFinite(options.fps) && (options.fps ?? 0) > 0 ? Math.round(options.fps!) : 30;

    const filters: string[] = [];
    if (resConfig) {
        // Scale while maintaining aspect ratio, pad if necessary
        filters.push(`scale=${resConfig.width}:${resConfig.height}:force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2`);
    }
    // Normalize frame cadence to avoid inflated duration from odd timebases
    filters.push(`fps=${targetFps}`);

    return filters.join(',');
};

