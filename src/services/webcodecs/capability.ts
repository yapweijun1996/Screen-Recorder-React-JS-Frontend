/**
 * WebCodecs capability detection.
 * Probes actual encoder support (not just isConfigSupported, which lies on Firefox).
 */

export interface WebCodecsSupport {
    supported: boolean;
    h264: boolean;      // Can encode H.264 (Chrome/Edge)
    vp8: boolean;       // Can encode VP8 (Firefox fallback)
    aac: boolean;       // Can encode AAC audio
    opus: boolean;      // Can encode Opus audio
}

let cachedSupport: WebCodecsSupport | null = null;

/**
 * Detect WebCodecs support with trial encode to avoid Firefox H.264 false positives.
 */
export async function detectWebCodecsSupport(): Promise<WebCodecsSupport> {
    if (cachedSupport) return cachedSupport;

    const result: WebCodecsSupport = {
        supported: false,
        h264: false,
        vp8: false,
        aac: false,
        opus: false,
    };

    if (typeof VideoEncoder === 'undefined') {
        cachedSupport = result;
        return result;
    }

    // Trial-encode a tiny frame to verify real support (Firefox reports H.264 supported but throws)
    result.h264 = await trialVideoEncode('avc1.42001f');
    result.vp8 = await trialVideoEncode('vp8');

    // Check audio encoders
    result.aac = await probeAudioEncoder('mp4a.40.2');
    result.opus = await probeAudioEncoder('opus');

    result.supported = result.h264 || result.vp8;
    cachedSupport = result;
    return result;
}

/** Trial-encode a single frame to verify the codec actually works */
async function trialVideoEncode(codec: string): Promise<boolean> {
    try {
        const config = await VideoEncoder.isConfigSupported({
            codec,
            width: 64,
            height: 64,
            bitrate: 100_000,
        });
        if (!config.supported) return false;

        // Actually try encoding a frame
        return new Promise<boolean>((resolve) => {
            let resolved = false;
            const encoder = new VideoEncoder({
                output: () => {
                    if (!resolved) { resolved = true; resolve(true); }
                },
                error: () => {
                    if (!resolved) { resolved = true; resolve(false); }
                },
            });

            try {
                encoder.configure({
                    codec,
                    width: 64,
                    height: 64,
                    bitrate: 100_000,
                });

                // Create a tiny canvas frame
                const canvas = new OffscreenCanvas(64, 64);
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, 64, 64);

                const frame = new VideoFrame(canvas, { timestamp: 0 });
                encoder.encode(frame, { keyFrame: true });
                frame.close();

                encoder.flush().then(() => {
                    encoder.close();
                    if (!resolved) { resolved = true; resolve(true); }
                }).catch(() => {
                    if (!resolved) { resolved = true; resolve(false); }
                });
            } catch {
                if (!resolved) { resolved = true; resolve(false); }
            }

            // Timeout after 3s
            setTimeout(() => {
                if (!resolved) { resolved = true; resolve(false); }
            }, 3000);
        });
    } catch {
        return false;
    }
}

async function probeAudioEncoder(codec: string): Promise<boolean> {
    try {
        if (typeof AudioEncoder === 'undefined') return false;
        const config = await AudioEncoder.isConfigSupported({
            codec,
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 128000,
        });
        return !!config.supported;
    } catch {
        return false;
    }
}

export function getCachedSupport(): WebCodecsSupport | null {
    return cachedSupport;
}
