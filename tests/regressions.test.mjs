import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';

// Use Vite's own TypeScript loader, avoiding a second test toolchain.
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { RecordingSession } = await server.ssrLoadModule('/src/components/recorder/RecordingSession.ts');
const { recordingActivity, taskActivity } = await server.ssrLoadModule('/src/services/taskActivity.ts');
const { probeAudioTrack } = await server.ssrLoadModule('/src/services/webcodecs/audioTrackProbe.ts');
const { openAudioSource, AudioExportError } = await server.ssrLoadModule('/src/services/webcodecs/exportAudio.ts');
const { planDeadlines: plan, createTimeline } = await server.ssrLoadModule('/src/services/webcodecs/exportTimeline.ts');
const planDeadlines = (segments, fps) => plan(createTimeline(segments, Math.max(...segments.map(s => s.end))), fps);
const { getExportErrorMessage } = await server.ssrLoadModule('/src/services/webcodecs/exportErrors.ts');

const track = () => ({ stops: 0, onended: () => {}, stop() { this.stops++; } });
const stream = (...tracks) => ({ getTracks: () => tracks });
const box = (type, ...payloads) => {
    const payload = Buffer.concat(payloads);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8);
    header.write(type, 4);
    return Buffer.concat([header, payload]);
};
const mp4 = (...types) => new Blob([
    box('ftyp', Buffer.from('isom0000')),
    box('moov', ...types.map(type => box('trak', box('mdia', box('hdlr', Buffer.alloc(8), Buffer.from(type)))))),
]);
const element = (id, ...payloads) => {
    const payload = Buffer.concat(payloads);
    assert.ok(payload.length < 127);
    return Buffer.concat([Buffer.from(id), Buffer.from([128 | payload.length]), payload]);
};
const webm = (...types) => new Blob([
    element([0x1a, 0x45, 0xdf, 0xa3]),
    // MediaRecorder uses a Segment whose size is unknown until recording ends.
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]),
    element([0x16, 0x54, 0xae, 0x6b], ...types.map(type => element([0xae], element([0x83], Buffer.from([type]))))),
]);

test('capture blocks navigation during setup, recording, pause and pending stop', () => {
    const session = new RecordingSession();
    try {
        assert.equal(recordingActivity.isBusy(), true); // Permission dialog is pending.
        session.recorder = { state: 'recording', stop() {} };
        assert.equal(recordingActivity.isBusy(), true);
        session.recorder.state = 'paused';
        assert.equal(recordingActivity.isBusy(), true);
        session.recorder.state = 'inactive'; // Final data and onstop still pending.
        assert.equal(recordingActivity.isBusy(), true);
    } finally { session.release(); }
    assert.equal(recordingActivity.isBusy(), false);
});

test('unrelated activity and released sessions do not lock navigation', () => {
    const endExport = taskActivity.begin();
    const first = new RecordingSession();
    const second = new RecordingSession();
    try {
        first.release();
        first.release();
        assert.equal(recordingActivity.isBusy(), true);
        second.release();
        assert.equal(recordingActivity.isBusy(), false);
        assert.equal(taskActivity.isBusy(), true);
    } finally { first.release(); second.release(); endExport(); }
});

for (const reason of ['normal completion', 'empty recording', 'permission failure', 'unmount']) {
    test(`releases raw and derived streams on ${reason}`, () => {
        const session = new RecordingSession();
        assert.equal(recordingActivity.isBusy(), true);
        const tracks = Array.from({ length: 5 }, track);
        tracks.slice(0, 3).forEach(item => session.ownStream(stream(item)));
        let compositorStops = 0;
        let contextCloses = 0;
        session.ownComposition({
            finalStream: stream(...tracks.slice(3)),
            compositor: { stop() { compositorStops++; } },
            audioMix: { context: { state: 'running', close() { contextCloses++; return Promise.resolve(); } } },
        });
        const recorder = { state: 'recording', onstop: () => {}, ondataavailable: () => {}, onerror: () => {}, stop() { this.state = 'inactive'; } };
        session.recorder = recorder;
        session.release();
        session.release();
        assert.equal(recordingActivity.isBusy(), false);
        assert.ok(tracks.every(item => item.stops === 1 && item.onended === null));
        assert.equal(recorder.state, 'inactive');
        assert.equal(recorder.onstop, null);
        assert.equal(recorder.ondataavailable, null);
        assert.equal(compositorStops, 1);
        assert.equal(contextCloses, 1);
    });
}

test('late permission response is stopped after unmount', async () => {
    const session = new RecordingSession();
    const mic = track();
    const pendingPermission = Promise.resolve(stream(mic));
    session.release();
    const acquired = await pendingPermission;
    assert.throws(() => session.ownStream(acquired), /Recording cancelled/);
    assert.equal(mic.stops, 1);
});

test('late composition releases canvas, devices and audio context', () => {
    const session = new RecordingSession();
    session.release();
    const canvas = track();
    let stopped = false;
    assert.throws(() => session.ownComposition({
        finalStream: stream(canvas), compositor: { stop() { stopped = true; } }, audioMix: null,
    }), /Recording cancelled/);
    assert.ok(stopped);
    assert.equal(canvas.stops, 1);
});

for (const [name, fixture, expected] of [
    ['silent MP4', mp4('vide'), false], ['MP4 with audio', mp4('vide', 'soun'), true],
    ['silent WebM', webm(1), false], ['WebM with audio', webm(1, 2), true],
    ['unknown format', new Blob(['not a media container']), null],
    ['truncated MP4', mp4('vide').slice(0, 25), null],
    ['truncated WebM', webm(1).slice(0, 13), null],
    ['missing track type', webm(), null],
]) {
    test(`audio probe: ${name}`, async () => assert.equal(await probeAudioTrack(fixture), expected));
}

test('metadata failures allow confirmed silent sources but reject audio and unknown sources', async () => {
    assert.equal(await openAudioSource(mp4('vide')), null);
    assert.equal(await openAudioSource(webm(1)), null);
    for (const source of [mp4('vide', 'soun'), webm(1, 2), new Blob(['unknown'])]) {
        await assert.rejects(openAudioSource(source), error => error instanceof AudioExportError && error.code === 'decodeFailed');
    }
});

test('audio export errors select useful translated messages', () => {
    const translate = key => `translated:${key}`;
    assert.equal(getExportErrorMessage(new AudioExportError('decodeFailed'), translate, 'converter.error'), 'translated:export.audio.decodeFailed');
    assert.equal(getExportErrorMessage(new AudioExportError('noTrack'), translate, 'editor.export.failed'), 'translated:export.audio.noTrack');
    assert.equal(getExportErrorMessage(new Error(), translate, 'converter.error'), 'translated:converter.error');
});

test('trimmed video frame plan preserves source gaps and continuous output', () => {
    const deadlines = planDeadlines([{ start: 0, end: 1 }, { start: 2, end: 3 }], 2, 500000);
    assert.deepEqual(deadlines.map(item => item.inputTime), [0, 0.5, 2, 2.5]);
    assert.deepEqual(deadlines.map(item => item.outputTimestampUs), [0, 500000, 1000000, 1500000]);
});
