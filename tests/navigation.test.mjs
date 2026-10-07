import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, after } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const activities = await server.ssrLoadModule('/src/services/taskActivity.ts');
const { RecordingSession } = await server.ssrLoadModule('/src/components/recorder/RecordingSession.ts');
const code = ts.transpileModule(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

// Exercise App's actual button handlers with an isolated render and real leases.
// Device APIs and persistence are outside this navigation regression's scope.
function renderNavigation() {
    let page = 'recorder';
    const react = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useEffect: () => {},
        useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
        useState: initial => [typeof initial === 'function' ? initial() : initial, value => { page = value; }],
    };
    const dependencies = {
        react,
        './types': { AppStatus: { IDLE: 'idle', REVIEWING: 'reviewing' } },
        './services/taskActivity': activities,
        './components/useVideoSession': { useVideoSession: () => ({ status: 'idle', isLoadingStored: false }) },
        './i18n': { useI18n: () => ({ t: key => key }) },
    };
    const exports = {};
    vm.runInNewContext(code, {
        exports, URLSearchParams, window: { location: { search: '' } },
        require: name => dependencies[name] ?? new Proxy({}, { get: () => () => null }),
    });
    const nodes = [];
    const visit = value => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') { nodes.push(value); visit(value.props?.children); }
    };
    visit(exports.default());
    return { button: nodes.find(node => node.type === 'button' && node.props.children.includes('converter.nav')), page: () => page };
}

test('converter navigation remains blocked until capture releases its session', () => {
    const idle = renderNavigation();
    assert.equal(idle.button.props.disabled, false);
    const session = new RecordingSession();
    try {
        idle.button.props.onClick(); // Handler from before the busy-state render.
        assert.equal(idle.page(), 'recorder');
        const busy = renderNavigation();
        assert.equal(busy.button.props.disabled, true);
        assert.equal(busy.button.props.title, 'app.navigation.recordingBusy');
        busy.button.props.onClick();
        assert.equal(busy.page(), 'recorder');
    } finally { session.release(); }
    idle.button.props.onClick();
    assert.equal(idle.page(), 'converter');
});

test('export activity does not disable converter navigation', () => {
    const endExport = activities.taskActivity.begin();
    try {
        const view = renderNavigation();
        assert.equal(view.button.props.disabled, false);
        view.button.props.onClick();
        assert.equal(view.page(), 'converter');
    } finally { endExport(); }
});
