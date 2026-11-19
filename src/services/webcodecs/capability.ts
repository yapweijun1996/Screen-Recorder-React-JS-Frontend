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

interface ProbeResult {
    supported: boolean;
    retryable: boolean;
}

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
    const h264 = await trialVideoEncode('avc1.42001f');
    const vp8 = await trialVideoEncode('vp8');
    result.h264 = h264.supported;
    result.vp8 = vp8.supported;

    // Check audio encoders
    const aac = await probeAudioEncoder('mp4a.40.2');
    const opus = await probeAudioEncoder('opus');
    result.aac = aac.supported;
    result.opus = opus.supported;

    result.supported = result.h264 || result.vp8;
    const retryableFailure = [h264, vp8, aac, opus].some(probe => probe.retryable);
    cachedSupport = result.supported || !retryableFailure ? result : null;
    return result;
}

/** Trial-encode a single frame to verify the codec actually works */
async function trialVideoEncode(codec: string): Promise<ProbeResult> {
    try {
        const config = await VideoEncoder.isConfigSupported({
            codec,
            width: 64,
            height: 64,
            bitrate: 100_000,
        });
        if (!config.supported) return { supported: false, retryable: false };

        // Actually try encoding a frame
        return new Promise<ProbeResult>((resolve) => {
            let finished = false;
            let producedOutput = false;
            const encoder = new VideoEncoder({
                output: () => { producedOutput = true; },
                error: () => { finish(false); },
            });
            const timer = setTimeout(() => finish(false), 3000);
            function finish(supported: boolean) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (encoder.state !== 'closed') {
                    try { encoder.close(); } catch { /* Already closed by the browser. */ }
                }
                resolve({ supported, retryable: !supported });
            }

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
                try { encoder.encode(frame, { keyFrame: true }); }
                finally { frame.close(); }
                void encoder.flush().then(() => finish(producedOutput), () => finish(false));
            } catch {
                finish(false);
            }
        });
    } catch {
        return { supported: false, retryable: true };
    }
}

async function probeAudioEncoder(codec: string): Promise<ProbeResult> {
    try {
        if (typeof AudioEncoder === 'undefined') return { supported: false, retryable: false };
        const config = await AudioEncoder.isConfigSupported({
            codec,
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 128000,
        });
        return { supported: !!config.supported, retryable: false };
    } catch {
        return { supported: false, retryable: true };
    }
}

export function getCachedSupport(): WebCodecsSupport | null {
    return cachedSupport;
}
