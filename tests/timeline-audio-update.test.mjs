import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { createTimeline, planDeadlines } = await server.ssrLoadModule('/src/services/webcodecs/exportTimeline.ts');
const { encodeAudioTimeline, AUDIO_CHUNK_FRAMES, AUDIO_QUEUE_LIMIT } = await server.ssrLoadModule('/src/services/webcodecs/encodeAudioTimeline.ts');
const { TaskActivity } = await server.ssrLoadModule('/src/services/taskActivity.ts');
const { ServiceWorkerUpdates } = await server.ssrLoadModule('/src/services/serviceWorkerUpdates.ts');
const { openAudioSource } = await server.ssrLoadModule('/src/services/webcodecs/exportAudio.ts');

for (const fps of [24, 30, 60]) {
    test(`20 fractional cuts share exact audio/video boundaries at ${fps}fps`, () => {
        const timeline = createTimeline(Array.from({ length: 20 }, (_, i) => ({ start: i, end: i + 0.501 })), 20);
        const frames = planDeadlines(timeline, fps);
        assert.equal(timeline.at(-1).outputEndUs, 10020000);
        assert.equal(frames.at(-1).outputTimestampUs + frames.at(-1).durationUs, 10020000);
        for (let i = 1; i < frames.length; i++) {
            assert.equal(frames[i - 1].outputTimestampUs + frames[i - 1].durationUs, frames[i].outputTimestampUs);
        }
        for (const segment of timeline) assert.ok(frames.some(f => f.outputTimestampUs === segment.outputStartUs));
    });
}

test('invalid FPS cannot make frame planning loop forever', () => {
    const timeline = createTimeline([{ start: 0, end: 1 }], 1);
    for (const fps of [0, -30, Infinity, NaN]) assert.throws(() => planDeadlines(timeline, fps), RangeError);
});

test('timeline clips out-of-range selections and ignores empty ranges', () => {
    assert.deepEqual(createTimeline([{ start: -1, end: 2 }, { start: 4, end: 10 }, { start: 8, end: 9 }], 5), [
        { start: 0, end: 2, outputStartUs: 0, outputEndUs: 2000000 },
        { start: 4, end: 5, outputStartUs: 2000000, outputEndUs: 3000000 },
    ]);
});

const fakeSample = (timestamp, frames, rate, channels = 2) => ({
    timestamp, sampleRate: rate, numberOfChannels: channels, numberOfFrames: frames,
    copyTo(destination, { frameOffset, frameCount, planeIndex }) {
        for (let i = 0; i < frameCount; i++) destination[i] = frameOffset + i + planeIndex * 10;
    },
    close() { this.closed = true; },
});
async function withAudioData(operation) {
    const previous = globalThis.AudioData;
    globalThis.AudioData = class { constructor(value) { Object.assign(this, value); } close() { this.closed = true; } };
    try { await operation(); } finally { globalThis.AudioData = previous; }
}

test('audio preserves planar trims, source gaps and cumulative timestamps', () => withAudioData(async () => {
    const chunks = [], samples = [];
    const source = {
        sampleRate: 4, numberOfChannels: 2,
        async *samples(start) { const sample = fakeSample(start < 1 ? 0 : 1, 4, 4); samples.push(sample); yield sample; },
    };
    const timeline = createTimeline([{ start: 0.25, end: 0.75 }, { start: 1, end: 1.5 }], 2);
    await encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0, encode: chunk => chunks.push(chunk) }, source, timeline);
    assert.deepEqual(chunks.map(chunk => [...chunk.data]), [[1, 2, 11, 12], [0, 1, 10, 11]]);
    assert.deepEqual(chunks.map(chunk => chunk.timestamp), [0, 500000]);
    assert.ok(samples.every(sample => sample.closed));
    assert.ok(chunks.every(chunk => chunk.closed));
}));

test('short or delayed audio is padded without shifting later cuts', () => withAudioData(async () => {
    const chunks = [];
    const source = { sampleRate: 4, numberOfChannels: 2, async *samples() { yield fakeSample(0.5, 1, 4); } };
    await encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0, encode: c => chunks.push(c) }, source, createTimeline([{ start: 0, end: 1 }], 1));
    assert.deepEqual(chunks.map(c => c.numberOfFrames), [2, 1, 1]);
    assert.deepEqual(chunks.map(c => c.timestamp), [0, 500000, 750000]);
    assert.deepEqual([...chunks[0].data], [0, 0, 0, 0]);
}));

test('one hour audio uses small allocations and a bounded encoder queue', () => withAudioData(async () => {
    class Encoder extends EventTarget {
        state = 'configured'; encodeQueueSize = 0; peakQueue = 0; peakBytes = 0; frames = 0;
        encode(chunk) {
            this.frames += chunk.numberOfFrames;
            this.peakBytes = Math.max(this.peakBytes, chunk.data.byteLength);
            this.peakQueue = Math.max(this.peakQueue, ++this.encodeQueueSize);
            setImmediate(() => { this.encodeQueueSize--; this.dispatchEvent(new Event('dequeue')); });
        }
    }
    const encoder = new Encoder();
    const source = { sampleRate: 48000, numberOfChannels: 2, async *samples() {} };
    await encodeAudioTimeline(encoder, source, createTimeline([{ start: 0, end: 3600 }], 3600));
    assert.equal(encoder.frames, 172800000);
    assert.equal(encoder.peakBytes, AUDIO_CHUNK_FRAMES * 2 * 4);
    assert.ok(encoder.peakQueue <= AUDIO_QUEUE_LIMIT);
}));

test('cancel interrupts a stalled decoder iterator', () => withAudioData(async () => {
    const controller = new AbortController();
    let returned = false;
    const source = { sampleRate: 48000, numberOfChannels: 2, samples: () => ({
        next: () => new Promise(() => {}), return: async () => { returned = true; },
    }) };
    const pending = encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0 }, source, createTimeline([{ start: 0, end: 1 }], 1), controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.ok(returned);
}));

test('cancel reaches a busy audio loop and releases its current sample', () => withAudioData(async () => {
    const controller = new AbortController();
    const sample = fakeSample(0, 172800000, 48000);
    const source = { sampleRate: 48000, numberOfChannels: 2, async *samples() { yield sample; } };
    let chunks = 0;
    const started = performance.now();
    const pending = encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0, encode() { chunks++; } }, source, createTimeline([{ start: 0, end: 3600 }], 3600), controller.signal);
    setTimeout(() => controller.abort(), 0);
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.ok(performance.now() - started < 250);
    assert.ok(chunks <= 32);
    assert.ok(sample.closed);
}));

test('a stalled encoder queue can be cancelled without retaining listeners or samples', () => withAudioData(async () => {
    class StalledEncoder extends EventTarget {
        state = 'configured'; encodeQueueSize = AUDIO_QUEUE_LIMIT; listeners = 0;
        addEventListener(...args) { this.listeners++; super.addEventListener(...args); }
        removeEventListener(...args) { this.listeners--; super.removeEventListener(...args); }
    }
    const encoder = new StalledEncoder();
    const controller = new AbortController();
    const sample = fakeSample(0, 48000, 48000);
    const source = { sampleRate: 48000, numberOfChannels: 2, async *samples() { yield sample; } };
    const pending = encodeAudioTimeline(encoder, source, createTimeline([{ start: 0, end: 1 }], 1), controller.signal);
    await new Promise(resolve => setImmediate(resolve)); controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(encoder.listeners, 0); assert.ok(sample.closed);
}));

test('decoder errors fail visibly instead of padding the whole selection with silence', () => withAudioData(async () => {
    let returned = false;
    const source = { sampleRate: 48000, numberOfChannels: 2, async *samples() {
        try { throw new Error('Injected decode failure'); } finally { returned = true; }
    } };
    await assert.rejects(encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0 }, source, createTimeline([{ start: 0, end: 1 }], 1)), error => error.code === 'decodeFailed');
    assert.ok(returned);
}));

test('fractional audio cuts round cumulative frames only once', () => withAudioData(async () => {
    const rate = 44100, chunks = [];
    const source = { sampleRate: rate, numberOfChannels: 2, async *samples(start) { yield fakeSample(start, 24000, rate); } };
    const timeline = createTimeline(Array.from({ length: 20 }, (_, i) => ({ start: i, end: i + 0.501 })), 20);
    await encodeAudioTimeline({ state: 'configured', encodeQueueSize: 0, encode: c => chunks.push(c) }, source, timeline);
    assert.equal(chunks.reduce((sum, c) => sum + c.numberOfFrames, 0), Math.round(10.02 * rate));
    const final = chunks.at(-1);
    assert.ok(Math.abs(final.timestamp + final.numberOfFrames / rate * 1e6 - 10020000) < 1);
}));

test('PCM input is read lazily and yields decoded blocks without whole-file reads', async () => {
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + 48000 * 4, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32);
    header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(48000 * 4, 40);
    const blob = new Blob([header, Buffer.alloc(48000 * 4)]);
    blob.arrayBuffer = () => { throw new Error('Whole-file read forbidden'); };
    const source = await openAudioSource(blob);
    try {
        assert.equal(source.sampleRate, 48000);
        assert.equal(source.numberOfChannels, 2);
        const iterator = source.samples(0.25, 0.5);
        const { value } = await iterator.next();
        assert.ok(value.numberOfFrames < 48000);
        value.close(); await iterator.return();
    } finally { source.dispose(); }
});

function swFixture(waiting = true) {
    const messages = [];
    const registration = Object.assign(new EventTarget(), { waiting: waiting ? { postMessage: m => messages.push(m) } : null, installing: null, update: async () => {} });
    const container = Object.assign(new EventTarget(), { controller: {}, register: async () => registration });
    const activity = new TaskActivity();
    let prompts = 0, reloads = 0;
    const previous = globalThis.document;
    globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const updates = new ServiceWorkerUpdates(container, activity, () => prompts++, () => reloads++);
    return { updates, container, registration, activity, messages, get prompts() { return prompts; }, get reloads() { return reloads; }, cleanup() { updates.dispose(); globalThis.document = previous; } };
}

test('waiting PWA prompts, blocks active work, activates and reloads after confirmation', async () => {
    const f = swFixture();
    try {
        await f.updates.start('/sw.js');
        assert.equal(f.prompts, 1);
        const end = f.activity.begin();
        assert.equal(f.updates.applyUpdate(), false); assert.equal(f.messages.length, 0);
        end(); end(); assert.equal(f.activity.isBusy(), false);
        assert.equal(f.updates.applyUpdate(), true);
        assert.deepEqual(f.messages, [{ type: 'SKIP_WAITING' }]); assert.equal(f.reloads, 0);
        f.container.dispatchEvent(new Event('controllerchange'));
        assert.equal(f.reloads, 1);
    } finally { f.cleanup(); }
});

test('external activation or work starting during activation never forces a busy reload', async () => {
    const f = swFixture();
    try {
        await f.updates.start('/sw.js'); f.updates.applyUpdate();
        const end = f.activity.begin();
        f.container.dispatchEvent(new Event('controllerchange'));
        assert.equal(f.reloads, 0);
        end(); assert.equal(f.reloads, 0);
        assert.equal(f.updates.applyUpdate(), true); assert.equal(f.reloads, 1);
    } finally { f.cleanup(); }
});

test('a newly installed waiting worker triggers the update prompt', async () => {
    const f = swFixture(false);
    try {
        await f.updates.start('/sw.js'); assert.equal(f.prompts, 0);
        const worker = new EventTarget(); f.registration.installing = worker;
        f.registration.dispatchEvent(new Event('updatefound'));
        f.registration.waiting = { postMessage: () => {} };
        worker.dispatchEvent(new Event('statechange')); assert.equal(f.prompts, 1);
        f.updates.dispose(); worker.dispatchEvent(new Event('statechange'));
        assert.equal(f.prompts, 1);
    } finally { f.cleanup(); }
});

test('independent activity leases protect overlapping operations and release once', () => {
    const activity = new TaskActivity();
    const endRecording = activity.begin(), endExport = activity.begin();
    endRecording(); endRecording(); assert.ok(activity.isBusy());
    endExport(); assert.equal(activity.isBusy(), false);
});

test('first PWA install does not reload; disposed registration never creates listeners', async () => {
    const f = swFixture(false);
    try {
        f.container.controller = null;
        const first = new ServiceWorkerUpdates(f.container, f.activity, () => { throw new Error('Unexpected prompt'); }, () => { throw new Error('Unexpected reload'); });
        await first.start('/sw.js'); f.container.controller = {};
        f.container.dispatchEvent(new Event('controllerchange')); first.dispose();
        f.updates.dispose(); await f.updates.start('/sw.js');
        assert.equal(f.updates.applyUpdate(), false);
    } finally { f.cleanup(); }
});
