import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const draftModule = await server.ssrLoadModule('/src/components/editor/editorDraftPersistence.ts');
const { applyManualSeek } = await server.ssrLoadModule('/src/components/editor/useEditorPlayback.ts');

const previousWindow = globalThis.window;
const values = new Map();
let failWrites = false;
globalThis.window = {
    localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => {
            if (failWrites) throw new DOMException('Injected quota exhaustion', 'QuotaExceededError');
            values.set(key, value);
        },
        removeItem: key => values.delete(key),
    },
};

after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
});

const draft = {
    version: 1,
    recordingId: 'recording-a',
    duration: 10,
    segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    selectedIndex: 1,
    selectedQuality: 'high',
    selectedResolution: '1080p',
    selectedFormat: 'webm',
    selectedFps: 60,
};

test('manual seek clears sequence preview before updating media state', () => {
    const video = { currentTime: 0 };
    const calls = [];
    applyManualSeek(video, 6, value => calls.push(['time', value]), value => calls.push(['preview', value]));
    assert.equal(video.currentTime, 6);
    assert.deepEqual(calls, [['preview', null], ['time', 6]]);
});

test('draft restoration is owned by recording identity and preserves export settings', () => {
    assert.equal(draftModule.saveEditorDraft(draft), true);
    assert.deepEqual(draftModule.loadEditorDraft('recording-a', 10), { status: 'restored', draft });
    assert.deepEqual(draftModule.loadEditorDraft('recording-b', 10), { status: 'none', draft: null });

    draftModule.saveEditorDraft({ ...draft, recordingId: 'recording-b', selectedFormat: 'audio' });
    draftModule.clearEditorDraft('recording-a');
    assert.deepEqual(draftModule.loadEditorDraft('recording-a', 10), { status: 'none', draft: null });
    assert.equal(draftModule.loadEditorDraft('recording-b', 10).draft.selectedFormat, 'audio');
});

test('malformed drafts are rejected before they can widen the retained export', () => {
    const key = draftModule.draftStorageKey('recording-a');
    values.set(key, JSON.stringify({ ...draft, segments: [{ start: 0, end: 11 }] }));
    assert.deepEqual(draftModule.loadEditorDraft('recording-a', 10), { status: 'invalid', draft: null });

    values.set(key, JSON.stringify({ ...draft, version: 0 }));
    assert.deepEqual(draftModule.loadEditorDraft('recording-a', 10), { status: 'invalid', draft: null });
    assert.equal(draftModule.saveEditorDraft({ ...draft, segments: [{ start: -1, end: 3 }] }), false);
});

test('draft save reports quota failures and preserves the last durable snapshot', () => {
    assert.equal(draftModule.saveEditorDraft(draft), true);
    failWrites = true;
    assert.equal(draftModule.saveEditorDraft({ ...draft, segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }], selectedIndex: 0 }), false);
    failWrites = false;
    assert.deepEqual(draftModule.loadEditorDraft('recording-a', 10).draft, draft);
});
