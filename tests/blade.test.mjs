import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { segmentsReducer } = await server.ssrLoadModule('/src/components/editor/segmentsState.ts');
const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useMemo: fn => fn() };
function load(name, dependencies = {}) {
    const code = ts.transpileModule(readFileSync(new URL(`../src/components/editor/${name}`, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require: name => ({ react, '../../i18n': { useI18n: () => ({ t: key => key }) }, '../../utils/format': { formatTime: String }, ...dependencies })[name] ?? new Proxy({}, { get: () => () => null }) });
    return exports;
}
const { TimelineClip } = load('TimelineClip.tsx', { './useClipTrim': { useClipTrim: () => ({ preview: null, handleProps: () => ({}) }) } });
const initial = () => ({ segments: [{ start: 0, end: 3 }, { start: 5, end: 15 }, { start: 18, end: 20 }], selectedIndex: 0, history: [] });
function render(tool = 'blade') {
    let state = initial(), selections = 0;
    const { ProTimeline } = load('ProTimeline.tsx', {
        './TimelineClip': { TimelineClip },
        './segmentsState': { MAX_SEGMENTS: 1000 },
        './useTimelineInteraction': { useTimelineInteraction: () => ({ containerRef: { current: null }, activeTool: tool, displayDuration: 15, zoomLevel: 1, ticks: [], collapsedSegments: [{ displayStart: 0, displayEnd: 3 }, { displayStart: 3, displayEnd: 13 }, { displayStart: 13, displayEnd: 15 }], toPct: time => time / 15 * 100, sourceToSequence: () => 0 }) },
    });
    const tree = ProTimeline({ maxDuration: 20, segments: state.segments, selectedIndex: 0, currentTime: 1, totalSelectedDuration: 15, canUndo: false, canDelete: true,
        onSeek: () => {}, onSelectSegment: () => selections++, onSplitAt: (time, index) => { state = segmentsReducer(state, { type: 'split', time, index }); } });
    const clips = [];
    const visit = node => {
        if (Array.isArray(node)) node.forEach(visit);
        else if (node && typeof node === 'object') { if (node.type === TimelineClip) clips.push(TimelineClip(node.props)); visit(node.props?.children); }
    };
    visit(tree);
    return { clips, state: () => state, selections: () => selections };
}
function click(clip, clientX, left = 100, width = 400, detail = 1) {
    let stopped = false;
    clip.props.onClick({ clientX, detail, stopPropagation: () => { stopped = true; }, currentTarget: { getBoundingClientRect: () => ({ left, width }) } });
    assert.equal(stopped, true); // The parent must not cut a second time.
}

test('blade cuts an unselected clip at the pointer and preserves the other ranges', () => {
    const h = render();
    click(h.clips[1], 300);
    assert.deepEqual(h.state().segments, [{ start: 0, end: 3 }, { start: 5, end: 10 }, { start: 10, end: 15 }, { start: 18, end: 20 }]);
    assert.equal(h.state().history.length, 1);
    assert.equal(h.selections(), 0);
    assert.deepEqual(segmentsReducer(h.state(), { type: 'undo' }).segments, initial().segments);
});

test('zoomed and scrolled clip coordinates retain the correct source offset', () => {
    const h = render();
    click(h.clips[2], 100, -300, 800);
    assert.deepEqual(h.state().segments.slice(-2), [{ start: 18, end: 19 }, { start: 19, end: 20 }]);
});

for (const x of [100, 101, 499, 500]) {
    test(`blade near clip edge ${x} cannot consume undo history`, () => {
        const h = render();
        click(h.clips[1], x);
        assert.deepEqual(h.state(), initial());
    });
}

test('selection clicks and keyboard activation cannot create pointer cuts', () => {
    const selected = render('select');
    click(selected.clips[1], 300);
    assert.equal(selected.selections(), 1);
    assert.deepEqual(selected.state(), initial());
    const blade = render();
    click(blade.clips[1], 0, 100, 400, 0);
    assert.deepEqual(blade.state(), initial());
});

test('keyboard split still uses selected segment; invalid pointer indexes are ignored', () => {
    const state = initial();
    assert.equal(segmentsReducer(state, { type: 'split', time: 1 }).segments.length, 4);
    for (const index of [-1, 9, 0.5]) assert.equal(segmentsReducer(state, { type: 'split', time: 1, index }), state);
});
