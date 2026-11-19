import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const { ServiceWorkerUpdates } = await server.ssrLoadModule('/src/services/serviceWorkerUpdates.ts');
const { TaskActivity } = await server.ssrLoadModule('/src/services/taskActivity.ts');

class VersionedWorker extends EventTarget {
    constructor(version) {
        super();
        this.version = version;
        this.state = 'installed';
        this.scriptURL = '/sw.js';
    }

    postMessage(message, ports = []) {
        if (message?.type === 'GET_BUILD_VERSION' && ports[0] && this.version) {
            ports[0].postMessage({ type: 'BUILD_VERSION', version: this.version });
        }
    }
}

function fixture({ waiting = null, installing = null, currentVersion = 'page-build' } = {}) {
    const current = new VersionedWorker(currentVersion);
    const registration = Object.assign(new EventTarget(), {
        active: current,
        waiting,
        installing,
        update: async () => {},
    });
    const container = Object.assign(new EventTarget(), {
        controller: current,
        register: async () => registration,
    });
    const previousDocument = globalThis.document;
    globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const notifications = [];
    const updates = new ServiceWorkerUpdates(
        container,
        new TaskActivity(),
        version => notifications.push(version ?? null),
        () => {},
        () => currentVersion,
    );
    return {
        updates,
        registration,
        container,
        notifications,
        restore() {
            updates.dispose();
            globalThis.document = previousDocument;
        },
    };
}

test('manual update checks return the exact waiting worker version', async () => {
    const fixtureState = fixture({ waiting: new VersionedWorker('next-build') });
    try {
        await fixtureState.updates.start('/sw.js');
        const result = await fixtureState.updates.checkForUpdates();
        assert.equal(result.status, 'available');
        assert.equal(result.currentVersion, 'page-build');
        assert.equal(result.waitingVersion, 'next-build');
        assert.ok(fixtureState.notifications.includes('next-build'));
    } finally {
        fixtureState.restore();
    }
});

test('manual update checks distinguish installing workers from the current page', async () => {
    const fixtureState = fixture({ installing: new VersionedWorker('installing-build') });
    try {
        await fixtureState.updates.start('/sw.js');
        const result = await fixtureState.updates.checkForUpdates();
        assert.equal(result.status, 'installing');
        assert.equal(result.currentVersion, 'page-build');
        assert.equal(result.installingVersion, 'installing-build');
        assert.equal(result.waitingVersion, null);
    } finally {
        fixtureState.restore();
    }
});

test('a waiting worker is available even when it reports the same build ID', async () => {
    const fixtureState = fixture({ waiting: new VersionedWorker('page-build') });
    try {
        await fixtureState.updates.start('/sw.js');
        const result = await fixtureState.updates.checkForUpdates();
        assert.equal(result.status, 'available');
        assert.equal(result.waitingVersion, 'page-build');
    } finally {
        fixtureState.restore();
    }
});

test('cross-tab activation stays available for local confirmation', async () => {
    const fixtureState = fixture();
    try {
        await fixtureState.updates.start('/sw.js');
        const activated = new VersionedWorker('activated-in-another-tab');
        fixtureState.registration.active = activated;
        fixtureState.container.controller = activated;
        fixtureState.container.dispatchEvent(new Event('controllerchange'));
        const result = await fixtureState.updates.checkForUpdates();
        assert.equal(result.status, 'available');
        assert.equal(result.currentVersion, 'page-build');
        assert.equal(result.waitingVersion, 'activated-in-another-tab');
    } finally {
        fixtureState.restore();
    }
});
