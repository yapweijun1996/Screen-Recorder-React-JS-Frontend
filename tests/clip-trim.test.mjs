import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, after } from 'node:test';
import ts from 'typescript';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const reducerModule = await server.ssrLoadModule('/src/components/editor/segmentsState.ts');
const { segmentsReducer } = reducerModule;

function createHandles(width = 1000) {
    const code = ts.transpileModule(readFileSync(new URL('../src/components/editor/useClipTrim.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    let preview = null;
    const exports = {};
    vm.runInNewContext(code, { exports, require: name => name === 'react'
        ? { useRef: () => ({ current: null }), useState: () => [null, value => { preview = value; }] }
        : reducerModule });
    let state = { segments: [{ start: 0, end: 3 }, { start: 5, end: 15 }, { start: 18, end: 20 }], selectedIndex: 1, history: [] };
    const { handleProps } = exports.useClipTrim({ segment: state.segments[1], bounds: { start: 3, end: 18 }, displayDuration: 15,
        onTrim: (start, end) => { state = segmentsReducer(state, { type: 'update', start, end, duration: 20 }); } });
    let capture = null;
    const target = { closest: () => ({ scrollWidth: width }), setPointerCapture: id => { capture = id; }, hasPointerCapture: id => capture === id, releasePointerCapture: () => { capture = null; } };
    const event = (clientX, pointerId = 1) => ({ clientX, pointerId, button: 0, currentTarget: target, stopPropagation() {}, preventDefault() {} });
    return { start: handleProps('start'), end: handleProps('end'), event, state: () => state, preview: () => preview, captured: () => capture };
}

test('left trim previews multiple moves, commits one edit and undoes the whole gesture', () => {
    const h = createHandles();
    const original = h.state().segments;
    h.start.onPointerDown(h.event(100));
    h.start.onPointerMove(h.event(200));
    h.start.onPointerMove(h.event(300));
    assert.deepEqual({ ...h.preview() }, { start: 8, end: 15 });
    assert.equal(h.state().history.length, 0);
    h.start.onPointerUp(h.event(300));
    assert.deepEqual({ ...h.state().segments[1] }, { start: 8, end: 15 });
    assert.equal(h.state().history.length, 1);
    assert.deepEqual(segmentsReducer(h.state(), { type: 'undo' }).segments, original);
    assert.equal(h.captured(), null);
});

test('zoomed right trim uses full track width and keeps source gaps', () => {
    const h = createHandles(2000);
    h.end.onPointerDown(h.event(400));
    h.end.onPointerUp(h.event(200));
    assert.deepEqual({ ...h.state().segments[1] }, { start: 5, end: 13.5 });
});

for (const [edge, x, expected] of [['start', -1000, { start: 3, end: 15 }], ['start', 2000, { start: 14.5, end: 15 }], ['end', 2000, { start: 5, end: 18 }], ['end', -1000, { start: 5, end: 5.5 }]]) {
    test(`${edge} trim clamps at ${x} without crossing adjacent clips or opposite edge`, () => {
        const h = createHandles();
        h[edge].onPointerDown(h.event(0));
        h[edge].onPointerUp(h.event(x));
        assert.deepEqual({ ...h.state().segments[1] }, expected);
    });
}

for (const action of ['onPointerCancel', 'onLostPointerCapture']) {
    test(`${action} discards the preview and leaves undo history untouched`, () => {
        const h = createHandles();
        h.start.onPointerDown(h.event(0));
        h.start.onPointerMove(h.event(100));
        h.start[action](h.event(100));
        assert.equal(h.preview(), null);
        assert.equal(h.state().history.length, 0);
        assert.equal(h.captured(), null);
    });
}

test('foreign pointers and clicking a handle without moving cannot edit a clip', () => {
    const h = createHandles();
    h.start.onPointerDown(h.event(0));
    h.start.onPointerMove(h.event(100, 2));
    h.start.onPointerUp(h.event(100, 2));
    assert.equal(h.preview(), null);
    assert.equal(h.captured(), 1);
    h.start.onPointerUp(h.event(0));
    assert.equal(h.state().history.length, 0);
});
