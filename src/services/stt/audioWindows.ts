import { openAudioSource } from '../webcodecs/exportAudio';
import type { AudioSample } from 'mediabunny';

export const STT_SAMPLE_RATE = 16_000;
export const STT_WINDOW_SECONDS = 24;
export const STT_WINDOW_FRAMES = STT_SAMPLE_RATE * STT_WINDOW_SECONDS;
const PAUSE_BLOCK_FRAMES = STT_SAMPLE_RATE / 100;
const PAUSE_MIN_FRAMES = Math.round(STT_SAMPLE_RATE * 0.35);
const PAUSE_MIN_SEGMENT_FRAMES = STT_SAMPLE_RATE * 3;
const PAUSE_RMS_THRESHOLD = 0.008;

export interface AudioWindow {
    pcm: Float32Array;
    start: number;
    end: number;
    totalDuration?: number;
    silent: boolean;
}

export interface AudioWindowOptions {
    splitOnSilence?: boolean;
}

export class NoAudioTrackError extends Error {
    constructor() {
        super('The recording does not contain a decodable audio track.');
        this.name = 'NoAudioTrackError';
    }
}

function downmixSample(sample: AudioSample): Float32Array {
    const frameCount = sample.numberOfFrames;
    const channels = sample.numberOfChannels;
    if (frameCount <= 0 || channels <= 0) return new Float32Array();

    const channelData = Array.from({ length: channels }, (_, channel) => {
        const data = new Float32Array(frameCount);
        sample.copyTo(data, { format: 'f32-planar', planeIndex: channel, frameCount });
        return data;
    });
    if (channels === 1) return channelData[0];

    const mono = new Float32Array(frameCount);
    const scale = 1 / channels;
    for (let frame = 0; frame < frameCount; frame++) {
        let value = 0;
        for (const channel of channelData) value += channel[frame];
        mono[frame] = value * scale;
    }
    return mono;
}

/** Resample one decoded sample with a small box filter and preserve its timeline. */
function resampleSample(
    mono: Float32Array,
    timestamp: number,
    sampleRate: number,
    firstFrame: number,
    lastFrame: number,
): Float32Array {
    const output = new Float32Array(Math.max(0, lastFrame - firstFrame));
    if (!output.length || !mono.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return output;
    for (let outputOffset = 0; outputOffset < output.length; outputOffset++) {
        const frame = firstFrame + outputOffset;
        const sourceStart = frame / STT_SAMPLE_RATE - timestamp;
        const sourceEnd = (frame + 1) / STT_SAMPLE_RATE - timestamp;
        const rangeStart = sourceStart * sampleRate;
        const rangeEnd = sourceEnd * sampleRate;
        const firstSource = Math.max(0, Math.floor(rangeStart));
        const lastSource = Math.min(mono.length, Math.ceil(rangeEnd));
        let weighted = 0;
        let weight = 0;
        for (let source = firstSource; source < lastSource; source++) {
            const overlap = Math.min(rangeEnd, source + 1) - Math.max(rangeStart, source);
            if (overlap > 0) {
                weighted += mono[source] * overlap;
                weight += overlap;
            }
        }
        output[outputOffset] = weight > 0 ? weighted / weight : 0;
    }
    return output;
}

function isSilent(pcm: Float32Array): boolean {
    let peak = 0;
    for (const value of pcm) peak = Math.max(peak, Math.abs(value));
    return peak < 0.00001;
}

function isQuietBlock(buffer: Float32Array, end: number): boolean {
    let energy = 0;
    for (let index = end - PAUSE_BLOCK_FRAMES; index < end; index++) {
        energy += buffer[index] ** 2;
    }
    return energy <= PAUSE_BLOCK_FRAMES * PAUSE_RMS_THRESHOLD ** 2;
}

/**
 * Decode audio as bounded 16 kHz mono windows. The generator never retains more
 * than one Whisper window and keeps source timestamps stable through gaps.
 */
export async function* readAudioWindows(
    blob: Blob,
    onProgress?: (progress: number, processedSeconds: number, totalSeconds?: number) => void,
    options: AudioWindowOptions = {},
): AsyncGenerator<AudioWindow, void, unknown> {
    const source = await openAudioSource(blob, undefined, { readDuration: true });
    if (!source) throw new NoAudioTrackError();

    let outputWindow = new Float32Array(STT_WINDOW_FRAMES);
    let outputFrames = 0;
    let windowStartFrame = 0;
    let nextFrame = 0;
    let sawSample = false;
    let processedEnd = 0;
    let heardSpeech = false;
    let quietFrames = 0;
    const totalDuration = source.duration && Number.isFinite(source.duration) && source.duration > 0
        ? source.duration
        : undefined;

    function finishWindow(): AudioWindow {
        const pcm = outputWindow.subarray(0, outputFrames);
        const start = windowStartFrame / STT_SAMPLE_RATE;
        windowStartFrame += outputFrames;
        outputWindow = new Float32Array(STT_WINDOW_FRAMES);
        outputFrames = 0;
        heardSpeech = false;
        quietFrames = 0;
        return { pcm, start, end: windowStartFrame / STT_SAMPLE_RATE, totalDuration, silent: isSilent(pcm) };
    }

    async function* append(values: Float32Array): AsyncGenerator<AudioWindow, void, unknown> {
        for (let offset = 0; offset < values.length;) {
            const capacity = options.splitOnSilence
                ? PAUSE_BLOCK_FRAMES - outputFrames % PAUSE_BLOCK_FRAMES
                : STT_WINDOW_FRAMES - outputFrames;
            const length = Math.min(capacity, values.length - offset);
            outputWindow.set(values.subarray(offset, offset + length), outputFrames);
            outputFrames += length;
            offset += length;
            // Commit a pause boundary before reaching the hard window limit so that
            // later utterances do not inherit a fixed 24-second split.
            if (options.splitOnSilence && outputFrames % PAUSE_BLOCK_FRAMES === 0) {
                const quiet = isQuietBlock(outputWindow, outputFrames);
                heardSpeech ||= !quiet;
                quietFrames = quiet ? quietFrames + PAUSE_BLOCK_FRAMES : 0;
            }
            const foundPause = heardSpeech && quietFrames >= PAUSE_MIN_FRAMES && outputFrames >= PAUSE_MIN_SEGMENT_FRAMES;
            if (foundPause || outputFrames === STT_WINDOW_FRAMES) yield finishWindow();
        }
    }

    async function* appendSilence(frameCount: number): AsyncGenerator<AudioWindow, void, unknown> {
        const zeros = new Float32Array(Math.min(STT_WINDOW_FRAMES, frameCount));
        for (let remaining = frameCount; remaining > 0;) {
            const length = Math.min(remaining, zeros.length);
            for await (const window of append(zeros.subarray(0, length))) yield window;
            remaining -= length;
        }
    }

    try {
        for await (const sample of source.samples(0, Infinity)) {
            sawSample = true;
            try {
                const sampleRate = sample.sampleRate;
                const sampleEnd = sample.timestamp + sample.numberOfFrames / sampleRate;
                const startFrame = Math.max(nextFrame, Math.floor(Math.max(0, sample.timestamp) * STT_SAMPLE_RATE));
                const endFrame = Math.max(startFrame, Math.ceil(Math.max(0, sampleEnd) * STT_SAMPLE_RATE));
                if (endFrame <= nextFrame) continue;

                if (startFrame > nextFrame) {
                    for await (const window of appendSilence(startFrame - nextFrame)) yield window;
                    nextFrame = startFrame;
                }

                const mono = downmixSample(sample);
                for (let cursor = nextFrame; cursor < endFrame;) {
                    const blockEnd = Math.min(endFrame, cursor + STT_WINDOW_FRAMES);
                    const values = resampleSample(mono, sample.timestamp, sampleRate, cursor, blockEnd);
                    for await (const window of append(values)) yield window;
                    cursor = blockEnd;
                }
                nextFrame = endFrame;
                processedEnd = Math.max(processedEnd, sampleEnd);
                const progress = totalDuration
                    ? Math.min(0.99, processedEnd / totalDuration)
                    : Math.min(0.99, processedEnd / (processedEnd + STT_WINDOW_SECONDS));
                onProgress?.(progress, processedEnd, totalDuration);
            } finally {
                sample.close();
            }
        }
        if (!sawSample) throw new Error('Audio track decoded no samples.');
        if (outputFrames > 0) yield finishWindow();
        onProgress?.(1, processedEnd, totalDuration);
    } finally {
        source.dispose();
    }
}
