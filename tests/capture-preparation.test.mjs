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

const { prepareCapture } = await server.ssrLoadModule('/src/components/recorder/capturePreparation.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

class FakeTrack {
    constructor(kind) { this.kind = kind; this.readyState = 'live'; this.onended = null; this.stopCount = 0; }
    stop() { this.stopCount++; this.readyState = 'ended'; }
    end() { if (this.readyState === 'ended') return; this.readyState = 'ended'; this.onended?.(); }
    getSettings() { return { width: 1280, height: 720 }; }
}

class FakeStream {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
}

class FakeAudioContext {
    state = 'suspended';
    createMediaStreamDestination() { return { stream: new FakeStream([new FakeTrack('audio')]) }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
}

class FakeRecorder {
    static instances = [];
    static isTypeSupported() { return true; }
    state = 'inactive';
    ondataavailable = null;
    onerror = null;
    onstop = null;
    stopError = null;
    constructor(stream) { this.stream = stream; FakeRecorder.instances.push(this); }
    start() { this.state = 'recording'; }
    requestData() {}
    stop() {
        if (this.state === 'inactive') throw new DOMException('Not recording', 'InvalidStateError');
        this.state = 'inactive';
        if (this.stopError) throw this.stopError;
        this.onstop?.();
    }
}

class FakeSession {
    static instances = [];
    constructor() {
        this.disposed = false;
        this.stopRequested = false;
        this.recorderError = null;
        this.recorder = null;
        this.releaseCount = 0;
        this.streams = new Set();
        FakeSession.instances.push(this);
    }
    ownStream(stream) {
        if (this.disposed) {
            stream.getTracks().forEach(track => track.stop());
            throw new DOMException('Recording cancelled', 'AbortError');
        }
        this.streams.add(stream);
        return stream;
    }
    ownComposition(composition) {
        if (this.disposed) {
            composition.finalStream.getTracks().forEach(track => track.stop());
            void composition.audioMix?.context.close();
            throw new DOMException('Recording cancelled', 'AbortError');
        }
        this.audioMix = composition.audioMix;
        this.compositor = composition.compositor;
        return this.ownStream(composition.finalStream);
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
        for (const stream of this.streams) {
            stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
        }
        this.streams.clear();
        void this.audioMix?.context.close();
        this.recorder = null;
    }
}

function installGlobals(mediaDevices) {
    const names = ['navigator', 'MediaStream', 'AudioContext'];
    const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { mediaDevices } });
    Object.defineProperty(globalThis, 'MediaStream', { configurable: true, writable: true, value: FakeStream });
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
    return () => previous.forEach((descriptor, name) => {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    });
}

function loadControllerHook(prepare = prepareCapture) {
    const source = ts.sys.readFile('src/components/recorder/useRecorderController.ts')
        .replace('const [enableMic, setEnableMic] = useState(false);', 'const [enableMic, setEnableMic] = useState(true);');
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
            if (name === './capturePreparation') return { prepareCapture: prepare };
            if (name === '../../i18n') return { useI18n: () => ({ t: key => key }) };
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
        navigator: { mediaDevices: {} },
        MediaRecorder: FakeRecorder,
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
    });
    return exports.useRecorderController;
}

function createController(errors, completed, prepare) {
    FakeRecorder.instances = [];
    FakeSession.instances = [];
    const Controller = loadControllerHook(prepare);
    const controller = Controller({
        onRecordingComplete: (...args) => completed.push(args),
        onError: message => errors.push(message),
    });
    controller.setEnableMic(true);
    return controller;
}

test('screen end during microphone permission never starts MediaRecorder', async () => {
    const errors = [];
    const completed = [];
    const screenTrack = new FakeTrack('video');
    const lateMicTrack = new FakeTrack('audio');
    let resolveMic;
    const restore = installGlobals({
        getDisplayMedia: async () => new FakeStream([screenTrack]),
        getUserMedia: async () => {
            screenTrack.end();
            return new Promise(resolve => { resolveMic = () => resolve(new FakeStream([lateMicTrack])); });
        },
    });
    try {
        const controller = createController(errors, completed);
        const starting = controller.startRecording();
        await tick();
        assert.equal(FakeSession.instances[0].disposed, true);
        resolveMic();
        await starting;
        assert.equal(FakeRecorder.instances.length, 0);
        assert.equal(lateMicTrack.stopCount, 1);
        assert.deepEqual(errors, ['recorder.errors.screenEnded']);
        assert.deepEqual(completed, []);
    } finally {
        restore();
    }
});

test('a stale setup failure cannot clear a restarted recorder finalizer', async () => {
    const errors = [];
    const completed = [];
    const firstScreenTrack = new FakeTrack('video');
    const secondScreenTrack = new FakeTrack('video');
    const lateMicTrack = new FakeTrack('audio');
    let resolveFirstMic;
    let mediaCall = 0;
    const restore = installGlobals({
        getDisplayMedia: async () => new FakeStream([mediaCall++ ? secondScreenTrack : firstScreenTrack]),
        getUserMedia: async () => {
            if (!resolveFirstMic) {
                firstScreenTrack.end();
                return new Promise(resolve => { resolveFirstMic = () => resolve(new FakeStream([lateMicTrack])); });
            }
            return new FakeStream([new FakeTrack('audio')]);
        },
    });
    try {
        const controller = createController(errors, completed);
        const staleStart = controller.startRecording();
        await tick();
        assert.equal(FakeSession.instances[0].disposed, true);

        await controller.startRecording();
        assert.equal(FakeRecorder.instances.length, 1);
        resolveFirstMic();
        await staleStart;
        assert.equal(lateMicTrack.stopCount, 1);

        FakeRecorder.instances[0].stopError = new Error('stop failed');
        controller.stopAction();
        assert.deepEqual(errors, ['recorder.errors.screenEnded', 'app.error.finalize']);
        assert.deepEqual(completed, []);
    } finally {
        restore();
    }
});

test('screen end after recorder inactivity keeps the queued stop finalizer', async () => {
    const errors = [];
    const completed = [];
    const screenTrack = new FakeTrack('video');
    const restore = installGlobals({
        getDisplayMedia: async () => new FakeStream([screenTrack]),
        getUserMedia: async () => new FakeStream(),
    });
    try {
        const controller = createController(errors, completed);
        await controller.startRecording();
        const recorder = FakeRecorder.instances[0];
        recorder.state = 'inactive';
        screenTrack.end();
        recorder.ondataavailable?.({ data: new Blob(['queued']) });
        recorder.onstop?.();
        assert.equal(completed.length, 1);
        assert.deepEqual(errors, []);
    } finally {
        restore();
    }
});

test('a track ended at the setup handoff cannot create a recorder', async () => {
    const errors = [];
    const completed = [];
    const screenTrack = new FakeTrack('video');
    const restore = installGlobals({
        getDisplayMedia: async () => new FakeStream([screenTrack]),
        getUserMedia: async () => new FakeStream(),
    });
    try {
        const controller = createController(errors, completed, async options => {
            const prepared = await prepareCapture(options);
            prepared.screenTrack.stop();
            return prepared;
        });
        await controller.startRecording();
        assert.equal(FakeRecorder.instances.length, 0);
        assert.equal(FakeSession.instances[0].disposed, true);
        assert.deepEqual(errors, ['recorder.errors.screenEnded']);
        assert.deepEqual(completed, []);
    } finally {
        restore();
    }
});
