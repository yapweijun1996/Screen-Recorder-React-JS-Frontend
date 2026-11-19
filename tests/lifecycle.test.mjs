import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { openSourceVideo } = await server.ssrLoadModule('/src/services/webcodecs/exportHelpers.ts');
const { waitForMedia, seekVideo } = await server.ssrLoadModule('/src/services/webcodecs/mediaWait.ts');
const { openAudioSource } = await server.ssrLoadModule('/src/services/webcodecs/exportAudio.ts');
const { readRecordingDuration } = await server.ssrLoadModule('/src/services/readRecordingDuration.ts');
const { ExportTaskScope } = await server.ssrLoadModule('/src/components/ExportTaskScope.ts');
const { VideoStorageService } = await server.ssrLoadModule('/src/services/videoStorageService.ts');
const { createSegmentsState, segmentsReducer } = await server.ssrLoadModule('/src/components/editor/segmentsState.ts');
const { readPreference, writePreference } = await server.ssrLoadModule('/src/services/preferenceStorage.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('preference storage is optional when access or an individual operation fails', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const denied = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    try {
        const values = new Map();
        globalThis.window = {
            localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
        };
        writePreference('screenclip.theme', 'light');
        assert.equal(readPreference('screenclip.theme'), 'light');
        globalThis.window = { localStorage: { getItem: denied, setItem: denied } };
        assert.equal(readPreference('screenclip.theme'), null);
        assert.doesNotThrow(() => writePreference('screenclip.language', 'fr'));
        globalThis.window = { get localStorage() { return denied(); } };
        assert.equal(readPreference('screenclip.language'), null);
        assert.doesNotThrow(() => writePreference('screenclip.theme', 'dark'));
    } finally {
        if (original) Object.defineProperty(globalThis, 'window', original);
        else delete globalThis.window;
    }
});

class FakeVideo extends EventTarget {
    readyState = 0; duration = 10; videoWidth = 160; videoHeight = 90;
    currentTime = 0; seeking = false; src = ''; pauses = 0; loads = 0;
    listeners = new Set();
    addEventListener(event, callback, options) { this.listeners.add(callback); super.addEventListener(event, callback, options); }
    removeEventListener(event, callback) { this.listeners.delete(callback); super.removeEventListener(event, callback); }
    pause() { this.pauses++; }
    removeAttribute() { this.src = ''; }
    load() { this.loads++; }
    emit(event) { this.dispatchEvent(new Event(event)); }
}

async function withMedia(run) {
    const previous = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const video = new FakeVideo(), revoked = [], created = [];
    globalThis.document = { createElement: () => video };
    URL.createObjectURL = () => { const url = `blob:test-${created.length}`; created.push(url); return url; };
    URL.revokeObjectURL = url => revoked.push(url);
    try { await run({ video, created, revoked }); }
    finally { globalThis.document = previous.document; URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke; }
}

for (const phase of ['metadata', 'canplay', 'duration seek']) {
    test(`cancelling source setup during ${phase} releases the source and listeners`, () => withMedia(async ({ video, revoked }) => {
        if (phase !== 'metadata') video.readyState = phase === 'canplay' ? 1 : 2;
        if (phase === 'duration seek') {
            video.duration = Infinity;
            Object.defineProperty(video, 'currentTime', { get: () => 0, set() { this.seeking = true; } });
        }
        const controller = new AbortController();
        const pending = openSourceVideo(new Blob(['video']), controller.signal);
        const rejected = assert.rejects(pending, error => error.name === 'AbortError');
        await tick();
        controller.abort();
        await rejected;
        assert.deepEqual(revoked, ['blob:test-0']);
        assert.equal(video.src, '');
        assert.equal(video.pauses, 1);
        assert.equal(video.listeners.size, 0);
    }));
}

for (const phase of ['metadata', 'canplay']) {
    test(`source ${phase} failure revokes the URL`, () => withMedia(async ({ video, revoked }) => {
        if (phase === 'canplay') video.readyState = 1;
        const pending = openSourceVideo(new Blob(['bad']));
        await tick();
        video.emit('error');
        await assert.rejects(pending, /Video failed/);
        assert.equal(revoked.length, 1);
        assert.equal(video.listeners.size, 0);
    }));
}

test('cached media readiness completes without another event; release is idempotent', () => withMedia(async ({ video, revoked }) => {
    video.readyState = 2;
    const source = await openSourceVideo(new Blob(['video']));
    source.release(); source.release();
    assert.equal(source.duration, 10);
    assert.equal(revoked.length, 1);
    assert.equal(video.listeners.size, 0);
}));

test('media timeout rejects and removes event handlers', async () => {
    const video = new FakeVideo();
    await assert.rejects(waitForMedia(video, 'canplay', { timeoutMs: 5 }), /timed out/);
    assert.equal(video.listeners.size, 0);
});

test('seeking at zero completes without an event; pending seeks are cancellable', async () => {
    const video = new FakeVideo();
    await seekVideo(video, 0);
    Object.defineProperty(video, 'currentTime', { get: () => 0, set() { this.seeking = true; } });
    const controller = new AbortController();
    const pending = seekVideo(video, 1, controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(video.listeners.size, 0);
});

test('seek handlers are installed before changing currentTime', async () => {
    const video = new FakeVideo();
    let time = 0;
    Object.defineProperty(video, 'currentTime', { get: () => time, set(value) { time = value; this.emit('seeked'); } });
    await seekVideo(video, 3);
    assert.equal(video.listeners.size, 0);
});

test('audio metadata reads can be cancelled and disposed while pending', async () => {
    class PendingBlob extends Blob {
        slice(...args) {
            const part = super.slice(...args);
            part.arrayBuffer = () => new Promise(() => {});
            return part;
        }
    }
    const controller = new AbortController();
    const pending = openAudioSource(new PendingBlob([new Uint8Array(1024)]), controller.signal);
    await tick(); controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
});

test('invalid measured duration rejects asynchronously and releases temporary metadata video', () => withMedia(async ({ video, revoked }) => {
    const pending = readRecordingDuration(new Blob(['bad']), 0);
    video.emit('error');
    await assert.rejects(pending, /Invalid recording duration/);
    assert.equal(revoked.length, 1);
    assert.equal(video.listeners.size, 0);
}));

test('metadata error can fall back to measured recording duration', () => withMedia(async ({ video, revoked }) => {
    const pending = readRecordingDuration(new Blob(['video']), 4);
    video.emit('error');
    assert.equal(await pending, 4);
    assert.equal(revoked.length, 1);
}));

test('navigation disposal blocks late results and revokes published output', () => withMedia(async ({ created, revoked }) => {
    const scope = new ExportTaskScope();
    const first = scope.start();
    assert.equal(scope.publish(first, new Blob(['output'])), 'blob:test-0');
    scope.dispose();
    assert.ok(first.signal.aborted);
    assert.equal(scope.publish(first, new Blob(['late output'])), null);
    assert.equal(created.length, 1);
    assert.deepEqual(revoked, created);
}));

test('replaced exports cannot publish or finish the current operation', () => withMedia(async ({ created }) => {
    const scope = new ExportTaskScope();
    const first = scope.start(), second = scope.start();
    assert.ok(first.signal.aborted);
    scope.finish(first);
    assert.ok(scope.isCurrent(second));
    assert.equal(scope.publish(first, new Blob()), null);
    assert.equal(created.length, 0);
    scope.dispose(); scope.activate();
    assert.equal(scope.publish(second, new Blob()), null);
    scope.dispose();
}));

async function withStorage(run) {
    const previous = globalThis.indexedDB, transactions = [];
    const db = { transaction() {
        const request = { result: undefined, error: null };
        const tx = { request, error: null, writes: [], deletions: [], objectStore: () => ({
            put: record => { tx.writes.push(record); return request; },
            delete: key => { tx.deletions.push(key); return request; },
            get: () => request,
        }) };
        transactions.push(tx);
        return tx;
    } };
    globalThis.indexedDB = { open() {
        const request = { result: db, error: null };
        queueMicrotask(() => request.onsuccess());
        return request;
    } };
    try { await run(new VideoStorageService(), transactions); }
    finally { globalThis.indexedDB = previous; }
}

for (const method of ['saveVideo', 'deleteVideo']) {
    const start = storage => method === 'saveVideo'
        ? storage.saveVideo(new Blob(['video']), 10)
        : storage.deleteVideo('matching-recording');
    test(`${method} waits for transaction commit after request success`, () => withStorage(async (storage, transactions) => {
        let settled = false;
        const pending = start(storage).then(() => { settled = true; });
        await tick();
        const tx = transactions[0];
        if (method === 'deleteVideo') tx.request.result = { recordingId: 'matching-recording' };
        tx.request.onsuccess?.();
        await tick();
        assert.equal(settled, false);
        tx.oncomplete(); await pending;
        assert.equal(settled, true);
    }));
    test(`${method} rejects transaction abort following request success`, () => withStorage(async (storage, transactions) => {
        const pending = start(storage);
        await tick();
        const tx = transactions[0];
        if (method === 'deleteVideo') tx.request.result = { recordingId: 'matching-recording' };
        tx.request.onsuccess?.();
        tx.error = new DOMException('Quota exhausted', 'QuotaExceededError');
        tx.onabort();
        await assert.rejects(pending, error => error.name === 'QuotaExceededError');
    }));
}

test('stale recording identity cannot delete a replacement', () => withStorage(async (storage, transactions) => {
    const pending = storage.deleteVideo('old-recording');
    await tick();
    const tx = transactions[0];
    tx.request.result = { recordingId: 'new-recording' };
    tx.request.onsuccess();
    tx.oncomplete();
    assert.equal(await pending, false);
    assert.deepEqual(tx.deletions, []);
}));

test('legacy recording gets an identity in the transaction that reads the current slot', () => withStorage(async (storage, transactions) => {
    const legacy = { id: 'current_recording', blob: new Blob(['video']), createdAt: 1 };
    const pending = storage.loadVideo();
    await tick();
    const read = transactions[0];
    read.request.result = legacy;
    read.oncomplete();
    await tick();
    const migration = transactions[1];
    migration.request.result = legacy;
    migration.request.onsuccess();
    migration.oncomplete();
    const restored = await pending;
    assert.ok(restored.recordingId);
    assert.equal(restored.blob, legacy.blob);
    assert.deepEqual(migration.writes, [restored]);
}));

test('storage errors are observable instead of appearing as an empty store', () => withStorage(async (storage, transactions) => {
    const pending = storage.loadVideo(); await tick();
    transactions[0].onerror();
    await assert.rejects(pending, /Storage transaction aborted/);
}));

test('failed database initialization can be retried', async () => {
    const previous = globalThis.indexedDB;
    let opens = 0;
    globalThis.indexedDB = { open() {
        const request = { error: new Error('Storage unavailable'), result: { transaction() { throw new Error('Reached retry transaction'); } } };
        queueMicrotask(() => ++opens === 1 ? request.onerror() : request.onsuccess());
        return request;
    } };
    try {
        const storage = new VideoStorageService();
        await assert.rejects(storage.loadVideo(), /Storage unavailable/);
        await assert.rejects(storage.loadVideo(), /Reached retry transaction/);
        assert.equal(opens, 2);
    } finally { globalThis.indexedDB = previous; }
});

test('trim draft retains undo history and rejects remounted metadata overwrites', () => {
    const initial = createSegmentsState(10);
    const split = segmentsReducer(initial, { type: 'split', time: 4 });
    const deleted = segmentsReducer(split, { type: 'delete', duration: 10 });
    assert.deepEqual(deleted.segments, [{ start: 0, end: 4 }]);
    assert.equal(segmentsReducer(deleted, { type: 'syncDuration', duration: 10 }), deleted);
    const undone = segmentsReducer(deleted, { type: 'undo' });
    assert.deepEqual(undone.segments, split.segments);
    assert.deepEqual(segmentsReducer(undone, { type: 'undo' }).segments, initial.segments);
    assert.deepEqual(createSegmentsState(10), initial);
});

test('invalid edits do not consume undo history; removal does not mutate the original draft', () => {
    const initial = createSegmentsState(10);
    assert.equal(segmentsReducer(initial, { type: 'split', time: 0.1 }), initial);
    const removed = segmentsReducer(initial, { type: 'remove', start: 3, end: 6, duration: 10 });
    assert.deepEqual(removed.segments, [{ start: 0, end: 3 }, { start: 6, end: 10 }]);
    assert.deepEqual(initial.segments, [{ start: 0, end: 10 }]);
    assert.deepEqual(segmentsReducer(removed, { type: 'undo' }).segments, initial.segments);
});
