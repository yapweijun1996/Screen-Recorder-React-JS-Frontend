import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';
import ts from 'typescript';
import vm from 'node:vm';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const { StreamCompositor, StreamCompositorError } = await server.ssrLoadModule('/src/utils/StreamCompositor.ts');

const tick = () => new Promise(resolve => setImmediate(resolve));

class FakeTrack {
    constructor(kind) { this.kind = kind; this.onended = null; this.stopCount = 0; }
    stop() { this.stopCount++; }
    getSettings() { return { width: 1280, height: 720 }; }
}

class FakeStream {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
}

class FakeRecorder {
    static instances = [];
    static isTypeSupported() { return true; }
    state = 'inactive';
    ondataavailable = null;
    onerror = null;
    onstop = null;
    pendingData = null;
    stopError = null;
    constructor(stream) { this.stream = stream; FakeRecorder.instances.push(this); }
    start() { this.state = 'recording'; }
    requestData() {}
    stop() {
        if (this.state === 'inactive') throw new DOMException('Not recording', 'InvalidStateError');
        this.state = 'inactive';
        if (this.stopError) throw this.stopError;
        if (this.pendingData) this.ondataavailable?.({ data: this.pendingData });
        this.onstop?.();
    }
    pause() { if (this.state !== 'recording') throw new Error('not recording'); this.state = 'paused'; }
    resume() { if (this.state !== 'paused') throw new Error('not paused'); this.state = 'recording'; }
}

class FakeSession {
    static instances = [];
    disposed = false;
    stopRequested = false;
    recorderError = null;
    recorder = null;
    compositor = null;
    audioMix = null;
    releaseCount = 0;
    constructor() { FakeSession.instances.push(this); }
    ownComposition(composition) {
        this.compositor = composition.compositor;
        this.audioMix = composition.audioMix;
        return composition.finalStream;
    }
    requestStop() {
        if (this.disposed || this.stopRequested) return false;
        this.stopRequested = true;
        return true;
    }
    recordError(error) { this.recorderError ??= error; }
    release() {
        if (this.disposed) return;
        this.disposed = true;
        this.releaseCount++;
        if (this.recorder) {
            this.recorder.ondataavailable = null;
            this.recorder.onerror = null;
            this.recorder.onstop = null;
            this.recorder = null;
        }
    }
}

function loadControllerHook() {
    const source = ts.sys.readFile('src/components/recorder/useRecorderController.ts');
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    const state = [];
    const react = {
        useState(initial) {
            const index = state.length;
            state.push(initial);
            return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useRef(value) { return { current: value }; },
        useEffect(effect) { effect(); },
        useCallback(callback) { return callback; },
    };
    vm.runInNewContext(output, {
        exports,
        require(name) {
            if (name === 'react') return react;
            if (name === './RecordingSession') return { RecordingSession: FakeSession };
            if (name === '../../i18n') return { useI18n: () => ({ t: key => key }) };
            if (name === './capturePreparation') return {
                prepareCapture: async ({ session }) => {
                    const screenTrack = new FakeTrack('video');
                    const finalStream = session.ownComposition({ finalStream: new FakeStream([screenTrack]), compositor: null, audioMix: null });
                    return { finalStream, screenTrack };
                },
            };
            if (name === './recorderControllerUtils') return {
                formatRecordingTimeLabel: seconds => `${seconds}`,
                getChosenRecordingPreset: () => ({ frameRate: 30, videoBitsPerSecond: 1_000_000 }),
            };
            throw new Error(`Unexpected import: ${name}`);
        },
        console,
        Blob,
        DOMException,
        Event,
        navigator: { mediaDevices: {
            getDisplayMedia: async () => new FakeStream([new FakeTrack('video')]),
            getUserMedia: async () => new FakeStream(),
        } },
        MediaRecorder: FakeRecorder,
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
    });
    return exports.useRecorderController;
}

async function withController(run) {
    const previous = { MediaRecorder: globalThis.MediaRecorder, navigator: globalThis.navigator };
    FakeRecorder.instances = [];
    FakeSession.instances = [];
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, writable: true, value: FakeRecorder });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: {
        mediaDevices: {
            getDisplayMedia: async () => new FakeStream([new FakeTrack('video')]),
            getUserMedia: async () => new FakeStream(),
        },
    } });
    try {
        const controller = loadControllerHook()({ onRecordingComplete: run.onComplete, onError: run.onError });
        await controller.startRecording();
        await run.check(controller, FakeSession.instances[0], FakeRecorder.instances[0]);
    } finally {
        if (previous.MediaRecorder) globalThis.MediaRecorder = previous.MediaRecorder;
        else delete globalThis.MediaRecorder;
        if (previous.navigator) globalThis.navigator = previous.navigator;
        else delete globalThis.navigator;
    }
}

test('MediaRecorder stop publishes one complete output and releases once', async () => {
    const completed = [];
    const errors = [];
    await withController({
        onComplete: (...args) => completed.push(args),
        onError: message => errors.push(message),
        check: async function(controller, session, recorder) {
            recorder.pendingData = new Blob(['complete']);
            controller.stopAction();
            await tick();
            assert.equal(recorder.state, 'inactive');
            assert.equal(session.releaseCount, 1);
        },
    });
    assert.equal(completed.length, 1);
    assert.equal(completed[0][0].size, 8);
    assert.equal(errors.length, 0);
});

test('MediaRecorder error before stop never hands off a partial blob', async () => {
    const completed = [];
    const errors = [];
    await withController({
        onComplete: (...args) => completed.push(args),
        onError: message => errors.push(message),
        check: async function(controller, session, recorder) {
            recorder.pendingData = new Blob(['partial']);
            const onError = recorder.onerror;
            const onStop = recorder.onstop;
            onError(new Event('error'));
            controller.stopAction();
            onStop();
            await tick();
            assert.equal(session.releaseCount, 1);
            assert.equal(session.disposed, true);
        },
    });
    assert.equal(completed.length, 0);
    assert.deepEqual(errors, ['app.error.finalize']);
});

test('pause after a terminal stop is a no-op', async () => {
    const errors = [];
    await withController({
        onComplete: () => {},
        onError: message => errors.push(message),
        check: async function(controller, session, recorder) {
            recorder.pendingData = new Blob(['complete']);
            controller.stopAction();
            assert.equal(recorder.state, 'inactive');
            assert.doesNotThrow(() => controller.pauseResume());
            assert.equal(session.releaseCount, 1);
        },
    });
    assert.deepEqual(errors, []);
});

test('a stop failure is finalized as one recorder error', async () => {
    const completed = [];
    const errors = [];
    await withController({
        onComplete: (...args) => completed.push(args),
        onError: message => errors.push(message),
        check: async function(controller, session, recorder) {
            recorder.stopError = new Error('stop failed');
            controller.stopAction();
            await tick();
            assert.equal(session.releaseCount, 1);
        },
    });
    assert.equal(completed.length, 0);
    assert.deepEqual(errors, ['app.error.finalize']);
});

class FakeVideo {
    readyState = 4;
    videoWidth = 160;
    videoHeight = 90;
    srcObject = null;
    muted = false;
    autoplay = false;
    playsInline = false;
    constructor(shouldReject) { this.shouldReject = shouldReject; this.pauseCount = 0; }
    play() { return this.shouldReject ? Promise.reject(new Error('play failed')) : Promise.resolve(); }
    pause() { this.pauseCount++; }
}

class FakeCanvas {
    width = 0;
    height = 0;
    context = { drawImage() {}, save() {}, restore() {}, beginPath() {}, roundRect() {}, clip() {}, stroke() {} };
    getContext() { return this.context; }
    captureStream() { return new FakeStream([new FakeTrack('video')]); }
}

class FakeAudioContext {
    state = 'suspended';
    resumeCalls = 0;
    closeCalls = 0;
    createMediaStreamDestination() { return { stream: new FakeStream([new FakeTrack('audio')]) }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
}

async function withCompositorGlobals(run, shouldReject = false) {
    const names = ['document', 'AudioContext', 'MediaStream', 'requestAnimationFrame', 'cancelAnimationFrame'];
    const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const contexts = [];
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: type => type === 'canvas' ? new FakeCanvas() : new FakeVideo(shouldReject) } });
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class extends FakeAudioContext { constructor() { super(); contexts.push(this); } } });
    Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: FakeStream });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: () => 1 });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
    try { await run(contexts); }
    finally {
        for (const [name, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
}

test('source playback failure rejects composition and closes audio resources', () => withCompositorGlobals(async contexts => {
    const compositor = new StreamCompositor({ width: 1280, height: 720, frameRate: 30 });
    await assert.rejects(compositor.start(new FakeStream([new FakeTrack('video')])), error => error instanceof StreamCompositorError);
    assert.equal(contexts[0].closeCalls, 1);
}, true));

test('suspended capture audio resumes before the final stream is exposed', () => withCompositorGlobals(async contexts => {
    const compositor = new StreamCompositor({ width: 1280, height: 720, frameRate: 30 });
    const stream = await compositor.start(new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]));
    assert.equal(contexts[0].resumeCalls, 1);
    assert.equal(stream.getVideoTracks().length, 1);
    assert.equal(stream.getAudioTracks().length, 1);
    compositor.stop();
}, false));
