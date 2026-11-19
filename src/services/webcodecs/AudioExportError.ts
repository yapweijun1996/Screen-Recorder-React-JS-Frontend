export class AudioExportError extends Error {
    constructor(public readonly code: 'decodeFailed' | 'noTrack' | 'encodeFailed') {
        super(
            code === 'decodeFailed'
                ? 'Unable to decode audio; export stopped to preserve sound.'
                : code === 'encodeFailed'
                    ? 'Unable to encode audio; export stopped to preserve sound.'
                    : 'No audio track found.',
        );
        this.name = 'AudioExportError';
    }
}
