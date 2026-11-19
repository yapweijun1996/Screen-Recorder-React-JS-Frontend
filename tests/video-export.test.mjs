import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { encodeVideoFrames, VIDEO_QUEUE_LIMIT } = await server.ssrLoadModule('/src/services/webcodecs/encodeVideoFrames.ts');
const { createTimeline, planDeadlines } = await server.ssrLoadModule('/src/services/webcodecs/exportTimeline.ts');
const { getExportDimensions } = await server.ssrLoadModule('/src/services/webcodecs/exportHelpers.ts');
const { openVideoSource, sampleSequentialVideo } = await server.ssrLoadModule('/src/services/webcodecs/exportVideo.ts');

test('sequential WebM samples hold the preceding frame through uneven gaps and the audio tail', async () => {
    const closed = [];
    const frame = timestamp => ({ timestamp, clone: () => ({ timestamp }), close: () => closed.push(timestamp) });
    const samples = sampleSequentialVideo(async function* (start) {
        assert.equal(start, 0);
        yield frame(0);
        yield frame(0.2);
        yield frame(0.75);
    }, [0, 0.1, 0.2, 0.7, 0.75, 1.1]);
    const actual = [];
    for await (const sample of samples) actual.push(sample.timestamp);
    assert.deepEqual(actual, [0, 0, 0.2, 0.2, 0.75, 0.75]);
    assert.deepEqual(closed, [0, 0.2, 0.75]);
});

test('sequential WebM sampling releases prefetched frames on consumer stop', async () => {
    const closed = [];
    let returned = false;
    const frame = timestamp => ({ timestamp, clone: () => ({ timestamp }), close: () => closed.push(timestamp) });
    const samples = sampleSequentialVideo(async function* () {
        try {
            yield frame(0);
            yield frame(1);
            assert.fail('The stopped consumer must not request additional decoded frames');
        } finally { returned = true; }
    }, [0, 0.5, 1]);
    for await (const sample of samples) {
        assert.equal(sample.timestamp, 0);
        break;
    }
    assert.deepEqual(closed, [0, 1]);
    assert.equal(returned, true);
});

test('overlapping export cuts reopen the sequential decoder after rewinding', async () => {
    const starts = [];
    const frame = timestamp => ({ timestamp, clone: () => ({ timestamp }), close() {} });
    const samples = sampleSequentialVideo(async function* (start) {
        starts.push(start);
        yield frame(0);
        yield frame(1);
    }, [0, 1, 0.5, 1]);
    const actual = [];
    for await (const sample of samples) actual.push(sample.timestamp);
    assert.deepEqual(starts, [0, 0.5]);
    assert.deepEqual(actual, [0, 1, 0, 1]);
});

async function withVideoRuntime(mode, operation) {
    const originals = Object.fromEntries(['VideoEncoder', 'VideoFrame', 'OffscreenCanvas'].map(key => [key, globalThis[key]]));
    const state = { encoders: [], frames: [], samples: [], submitted: [], output: [], requested: [], peakQueue: 0, returned: false };
    const quotaError = new DOMException('Injected resource exhaustion', 'QuotaExceededError');
    globalThis.VideoEncoder = class extends EventTarget {
        state = 'unconfigured'; encodeQueueSize = 0; listeners = new Set(); pending = [];
        constructor(callbacks) {
            super();
            if (mode === 'constructor failure') throw new Error('Constructor failed');
            this.callbacks = callbacks;
            state.encoders.push(this);
        }
        addEventListener(type, listener, options) { this.listeners.add(listener); super.addEventListener(type, listener, options); }
        removeEventListener(type, listener) { this.listeners.delete(listener); super.removeEventListener(type, listener); }
        configure() {
            if (mode === 'configure failure') throw new Error('Configure failed');
            this.state = 'configured';
        }
        encode(frame, options) {
            if (mode === 'frame failure') throw new Error('Encode failed');
            state.submitted.push({ timestamp: frame.timestamp, duration: frame.duration, id: frame.id, keyFrame: options.keyFrame });
            state.peakQueue = Math.max(state.peakQueue, ++this.encodeQueueSize);
            if (mode === 'stalled queue') return;
            this.pending.push(new Promise(resolve => setImmediate(() => {
                if (mode === 'quota failure' || mode === 'terminal quota') {
                    this.state = 'closed';
                    this.callbacks.error(quotaError);
                } else {
                    this.encodeQueueSize--;
                    const chunk = { timestamp: frame.timestamp, duration: 999999 };
                    if (mode === 'unexpected output') chunk.timestamp++;
                    if (mode !== 'missing output') this.callbacks.output(chunk);
                    if (mode === 'duplicate output') this.callbacks.output(chunk);
                    this.dispatchEvent(new Event('dequeue'));
                }
                resolve();
            })));
        }
        async flush() {
            if (mode === 'flush failure') { this.callbacks.error(quotaError); throw quotaError; }
            if (mode === 'stalled flush') return new Promise(() => {});
            await Promise.all(this.pending);
        }
        close() { this.state = 'closed'; }
    };
    globalThis.VideoFrame = class {
        constructor(canvas, options) { Object.assign(this, options); this.id = canvas.id; this.closes = 0; state.frames.push(this); }
        close() { this.closes++; }
    };
    globalThis.OffscreenCanvas = class {
        getContext() { return { canvas: this, fillRect() {} }; }
    };
    const makeSample = id => {
        const sample = { id, closes: 0, drawWithFit(context, { fit }) { assert.equal(fit, 'contain'); context.canvas.id = id; }, close() { this.closes++; } };
        state.samples.push(sample);
        return sample;
    };
    const source = {
        width: 320, height: 180, dispose() {},
        samples(timestamps) {
            const times = [...timestamps];
            state.requested = times;
            let index = 0;
            return {
                async next() {
                    if (mode === 'stalled decoder') return new Promise(() => {});
                    if (mode === 'decoder failure') throw new Error('Decoder failed');
                    if (mode === 'early end') return { done: true };
                    if (mode === 'missing sample') return { done: false, value: null };
                    return { done: false, value: makeSample(Math.round(times[index++] * 60)) };
                },
                async return() {
                    state.returned = true;
                    if (mode === 'stalled return') return new Promise(() => {});
                    return { done: true };
                },
            };
        },
    };
    state.run = (overrides = {}) => encodeVideoFrames({
        source, width: 320, height: 180,
        deadlines: planDeadlines(createTimeline([{ start: 0, end: 4 }], 4), 60),
        quality: 'medium', targetFps: 60, useMp4: true,
        addVideoChunk: (chunk, _meta, durationUs) => state.output.push({ ...chunk, duration: durationUs }), ...overrides,
    });
    state.makeSample = makeSample;
    try { await operation(state, quotaError); }
    finally { Object.assign(globalThis, originals); }
    assert.ok(state.encoders.every(encoder => encoder.state === 'closed' && encoder.listeners.size === 0));
    assert.ok(state.frames.every(frame => frame.closes === 1));
    assert.ok(state.samples.every(sample => sample.closes === 1));
}

test('60fps export consumes all 240 distinct source frames with bounded queue', () => withVideoRuntime('success', async state => {
    await state.run();
    assert.equal(state.output.length, 240);
    assert.deepEqual(state.submitted.map(frame => frame.id), Array.from({ length: 240 }, (_, index) => index));
    assert.ok(state.peakQueue <= VIDEO_QUEUE_LIMIT);
    assert.ok(state.returned);
}));

test('cut sampling preserves source gaps and exact cumulative output timing', () => withVideoRuntime('success', async state => {
    const deadlines = planDeadlines(createTimeline([{ start: 0, end: 0.501 }, { start: 2, end: 2.501 }], 3), 30);
    await state.run({ deadlines, targetFps: 30 });
    assert.deepEqual(state.requested, deadlines.map(frame => frame.inputTime));
    assert.deepEqual(state.submitted.map(frame => frame.timestamp), deadlines.map(frame => frame.outputTimestampUs));
    assert.equal(state.submitted.at(-1).timestamp + state.submitted.at(-1).duration, 1002000);
    assert.equal(state.output.at(-1).timestamp + state.output.at(-1).duration, 1002000);
    assert.ok(state.submitted[16].keyFrame);
}));

for (const [mode, message] of [
    ['constructor failure', /Constructor failed/], ['configure failure', /Configure failed/],
    ['frame failure', /Encode failed/], ['decoder failure', /Decoder failed/],
    ['missing sample', /Missing decoded video frame/], ['early end', /Missing decoded video frame/],
    ['missing output', /did not output every requested frame/],
    ['unexpected output', /unexpected or duplicate frame/], ['duplicate output', /unexpected or duplicate frame/],
]) {
    test(`video ${mode} rejects and releases owned resources`, () => withVideoRuntime(mode, state => assert.rejects(state.run(), message)));
}

for (const mode of ['quota failure', 'terminal quota', 'flush failure']) {
    test(`${mode} preserves the encoder error and never returns success`, () => withVideoRuntime(mode, async (state, error) => {
        const overrides = mode === 'terminal quota' ? { deadlines: planDeadlines(createTimeline([{ start: 0, end: 1 / 60 }], 1), 60) } : {};
        await assert.rejects(state.run(overrides), observed => observed === error);
        assert.equal(state.encoders.length, 1);
    }));
}

test('muxer callback failure reaches the caller instead of escaping asynchronously', () => withVideoRuntime('success', async state => {
    await assert.rejects(state.run({ addVideoChunk() { throw new Error('Muxer failed'); } }), /Muxer failed/);
}));

for (const mode of ['stalled decoder', 'stalled queue', 'stalled flush', 'stalled return']) {
    test(`cancel interrupts ${mode} and removes queue listeners`, () => withVideoRuntime(mode, async state => {
        const controller = new AbortController();
        const deadlines = planDeadlines(createTimeline([{ start: 0, end: 0.1 }], 1), 60);
        const pending = state.run({ signal: controller.signal, deadlines });
        setTimeout(() => controller.abort(), 10);
        await assert.rejects(pending, error => error.name === 'AbortError');
        assert.ok(state.returned);
    }));
}

test('a decoder inactivity timeout rejects and releases resources without user cancellation', () => withVideoRuntime('stalled decoder', async state => {
    const nativeTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 30000 ? 1 : delay, ...args);
    try { await assert.rejects(state.run(), /timed out/); }
    finally { globalThis.setTimeout = nativeTimeout; }
}));

test('cancel closes a sample delivered after the decoder wait was abandoned', () => withVideoRuntime('success', async state => {
    let deliver;
    const source = { samples: () => ({ next: () => new Promise(resolve => { deliver = resolve; }), async return() { return { done: true }; } }) };
    const controller = new AbortController();
    const pending = state.run({ source, signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    deliver({ done: false, value: state.makeSample(0) });
    await new Promise(resolve => setImmediate(resolve));
}));

test('video metadata/decode failure and pre-abort remain visible', async () => {
    await assert.rejects(openVideoSource(new Blob(['malformed container'])));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(openVideoSource(new Blob(), controller.signal), error => error.name === 'AbortError');
});

for (const [width, height, resolution, expected] of [
    [1920, 1080, '720p', [1280, 720]], [1080, 1920, '720p', [720, 1280]],
    [640, 480, '720p', [960, 720]], [480, 640, '1080p', [1080, 1440]],
    [1000, 1000, '4k', [2160, 2160]], [321, 181, 'original', [322, 182]],
]) {
    test(`${resolution} dimensions preserve ${width}x${height} orientation and preset bounds`, () => {
        const dimensions = getExportDimensions(width, height, resolution);
        assert.deepEqual([dimensions.width, dimensions.height], expected);
        assert.equal(dimensions.width % 2 + dimensions.height % 2, 0);
    });
}

test('invalid source dimensions cannot configure a video encoder', () => {
    for (const value of [0, -1, NaN, Infinity]) assert.throws(() => getExportDimensions(value, 720, '720p'), /Invalid source/);
});
