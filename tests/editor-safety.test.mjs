import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const { MAX_SEGMENTS, segmentsReducer } = await server.ssrLoadModule('/src/components/editor/segmentsState.ts');
const { validateEditorDraft } = await server.ssrLoadModule('/src/components/editor/editorDraftPersistence.ts');
const { clampToSegment } = await server.ssrLoadModule('/src/components/editor/useKeyboardShortcuts.ts');
const { sequenceTimeFromPixels } = await server.ssrLoadModule('/src/components/editor/timelineCoordinates.ts');
const { calculateHandScrollLeft } = await server.ssrLoadModule('/src/components/editor/useTimelineInteraction.ts');

test('deleting the only retained clip is a no-op', () => {
    const state = {
        segments: [{ start: 8, end: 12 }],
        selectedIndex: 0,
        history: [],
    };

    assert.deepEqual(segmentsReducer(state, { type: 'delete', duration: 20 }), state);
    assert.deepEqual(segmentsReducer(state, { type: 'remove', start: 7, end: 13, duration: 20 }), state);
});

test('deleting one of multiple clips keeps the other clip and records one undo state', () => {
    const state = {
        segments: [{ start: 0, end: 8 }, { start: 12, end: 20 }],
        selectedIndex: 1,
        history: [],
    };

    const next = segmentsReducer(state, { type: 'delete', duration: 20 });
    assert.deepEqual(next.segments, [{ start: 0, end: 8 }]);
    assert.equal(next.selectedIndex, 0);
    assert.deepEqual(next.history, [state.segments]);
});

test('reverse shuttle stays inside the selected clip', () => {
    assert.equal(clampToSegment(4.9, 5, 10), 5);
    assert.equal(clampToSegment(9.5, 5, 10), 9.5);
    assert.equal(clampToSegment(11, 5, 10), 10);
});

test('playhead drag uses the zoomed track width', () => {
    assert.equal(sequenceTimeFromPixels(80, 1600, 60, 10), 13);
    assert.equal(sequenceTimeFromPixels(80 + 200, 1600, 60), 10.5);
});

test('hand panning clamps the scroll position', () => {
    assert.equal(calculateHandScrollLeft(400, 120, 800), 280);
    assert.equal(calculateHandScrollLeft(400, -600, 800), 800);
    assert.equal(calculateHandScrollLeft(400, 600, 800), 0);
});

test('split editing stops at the draft persistence capacity', () => {
    let state = {
        segments: [{ start: 0, end: MAX_SEGMENTS + 1001 }],
        selectedIndex: 0,
        history: [],
    };
    for (let time = 1; time < MAX_SEGMENTS; time++) {
        state = segmentsReducer(state, { type: 'split', time });
    }
    assert.equal(state.segments.length, MAX_SEGMENTS);
    assert.equal(segmentsReducer(state, { type: 'split', time: MAX_SEGMENTS }), state);
    assert.equal(validateEditorDraft({
        version: 1,
        recordingId: 'capacity-test',
        duration: MAX_SEGMENTS + 1001,
        segments: state.segments,
        selectedIndex: state.selectedIndex,
        selectedQuality: 'medium',
        selectedResolution: 'original',
        selectedFormat: 'mp4',
        selectedFps: 30,
    }, 'capacity-test', MAX_SEGMENTS + 1001)?.segments.length, MAX_SEGMENTS);
});
