/**
 * WebCodecs capability detection.
 * Checks if the browser supports VideoEncoder/AudioEncoder with H.264/AAC.
 */

export interface WebCodecsSupport {
    supported: boolean;
    videoEncoder: boolean;
    audioEncoder: boolean;
    videoDecoder: boolean;
    audioDecoder: boolean;
}

let cachedSupport: WebCodecsSupport | null = null;

/**
 * Detect WebCodecs support for H.264 encoding + AAC audio.
 * Result is cached after first call.
 */
export async function detectWebCodecsSupport(): Promise<WebCodecsSupport> {
    if (cachedSupport) return cachedSupport;

    const result: WebCodecsSupport = {
        supported: false,
        videoEncoder: false,
        audioEncoder: false,
        videoDecoder: false,
        audioDecoder: false,
    };

    // Check basic API availability
    if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
        cachedSupport = result;
        return result;
    }

    // Check H.264 video encoder support
    try {
        const videoConfig: VideoEncoderConfig = {
            codec: 'avc1.42001f', // H.264 Baseline Level 3.1
            width: 1280,
            height: 720,
            bitrate: 3_000_000,
        };
        const videoSupport = await VideoEncoder.isConfigSupported(videoConfig);
        result.videoEncoder = !!videoSupport.supported;
    } catch {
        result.videoEncoder = false;
    }

    // Check H.264 video decoder support
    try {
        const decoderConfig: VideoDecoderConfig = {
            codec: 'vp8', // WebM VP8 (input format from MediaRecorder)
        };
        const decoderSupport = await VideoDecoder.isConfigSupported(decoderConfig);
        result.videoDecoder = !!decoderSupport.supported;
    } catch {
        result.videoDecoder = false;
    }

    // Check AAC audio encoder support
    try {
        if (typeof AudioEncoder !== 'undefined') {
            const audioConfig: AudioEncoderConfig = {
                codec: 'mp4a.40.2', // AAC-LC
                numberOfChannels: 2,
                sampleRate: 48000,
                bitrate: 128000,
            };
            const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
            result.audioEncoder = !!audioSupport.supported;
        }
    } catch {
        result.audioEncoder = false;
    }

    // Check audio decoder support
    try {
        if (typeof AudioDecoder !== 'undefined') {
            const audioDecoderConfig: AudioDecoderConfig = {
                codec: 'opus', // WebM typically uses Opus
                numberOfChannels: 2,
                sampleRate: 48000,
            };
            const audioDecoderSupport = await AudioDecoder.isConfigSupported(audioDecoderConfig);
            result.audioDecoder = !!audioDecoderSupport.supported;
        }
    } catch {
        result.audioDecoder = false;
    }

    result.supported = result.videoEncoder && result.videoDecoder;
    cachedSupport = result;
    return result;
}

/** Quick synchronous check (returns false if not yet probed) */
export function isWebCodecsAvailable(): boolean {
    return cachedSupport?.supported ?? false;
}
