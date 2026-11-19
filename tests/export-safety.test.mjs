import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const { awaitWithTimeout } = await server.ssrLoadModule('/src/services/webcodecs/mediaWait.ts');
const { ExportService } = await server.ssrLoadModule('/src/services/exportService.ts');
const capability = await server.ssrLoadModule('/src/services/webcodecs/capability.ts');

test('timed media waits reject a stalled native operation', async () => {
    await assert.rejects(
        awaitWithTimeout(new Promise(() => {}), 10, 'Audio encoder timed out'),
        error => error instanceof Error && error.message === 'Audio encoder timed out',
    );
});

test('timed media waits remain promptly cancellable', async () => {
    const controller = new AbortController();
    const pending = awaitWithTimeout(new Promise(() => {}), 1_000, 'Audio encoder timed out', controller.signal);
    controller.abort();
    await assert.rejects(
        pending,
        error => error instanceof DOMException && error.name === 'AbortError',
    );
});

test('export initialization retries exceptional probes and deduplicates in-flight calls', async () => {
    let attempts = 0;
    const support = { supported: true, h264: true, vp8: true, aac: true, opus: true };
    const service = new ExportService(async () => {
        attempts++;
        if (attempts === 1) throw new Error('temporary probe failure');
        return support;
    });

    await service.init();
    assert.equal(service.getStatus(), 'error');

    await Promise.all([service.init(), service.init()]);
    assert.equal(attempts, 2);
    assert.equal(service.getStatus(), 'ready');
    assert.equal(service.getEngine(), 'webcodecs');
});

test('exceptional capability probes are not cached as permanent unsupported results', async () => {
    const originalVideoEncoder = globalThis.VideoEncoder;
    const originalAudioEncoder = globalThis.AudioEncoder;
    let videoProbeCalls = 0;
    try {
        globalThis.VideoEncoder = {
            isConfigSupported: async () => {
                videoProbeCalls++;
                throw new Error('temporary codec probe failure');
            },
        };
        globalThis.AudioEncoder = {
            isConfigSupported: async () => { throw new Error('temporary audio probe failure'); },
        };

        const first = await capability.detectWebCodecsSupport();
        assert.equal(first.supported, false);
        assert.equal(capability.getCachedSupport(), null);

        globalThis.VideoEncoder = {
            isConfigSupported: async () => {
                videoProbeCalls++;
                return { supported: false };
            },
        };
        globalThis.AudioEncoder = { isConfigSupported: async () => ({ supported: false }) };
        const second = await capability.detectWebCodecsSupport();
        assert.equal(second.supported, false);
        assert.equal(capability.getCachedSupport(), second);
        assert.equal(await capability.detectWebCodecsSupport(), second);
        assert.equal(videoProbeCalls, 4);
    } finally {
        globalThis.VideoEncoder = originalVideoEncoder;
        globalThis.AudioEncoder = originalAudioEncoder;
    }
});
