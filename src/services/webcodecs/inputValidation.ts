const VIDEO_EXTENSIONS = new Set([
    '.avi', '.flv', '.m4v', '.mkv', '.mov', '.mp4', '.ogv', '.webm', '.wmv',
]);

interface LocalVideoCandidate {
    name?: string;
    type?: string;
    size?: number;
}

/**
 * Apply the same cheap check to picker and drag/drop input. MIME and extension
 * are only hints: an empty MIME is accepted and the media decoder remains the
 * authority for damaged or mislabeled files.
 */
export function isLikelyVideoInput(file: LocalVideoCandidate): boolean {
    if (!Number.isFinite(file.size) || (file.size ?? 0) <= 0) return false;
    const mime = (file.type ?? '').trim().toLowerCase();
    if (!mime || mime === 'application/octet-stream' || mime.startsWith('video/')) return true;
    const name = (file.name ?? '').toLowerCase();
    const extension = name.slice(name.lastIndexOf('.'));
    return VIDEO_EXTENSIONS.has(extension);
}

export const supportedVideoExtensions = [...VIDEO_EXTENSIONS];
