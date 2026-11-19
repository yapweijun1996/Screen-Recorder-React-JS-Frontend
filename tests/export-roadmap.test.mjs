import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test, after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const timeline = await server.ssrLoadModule('/src/services/webcodecs/exportTimeline.ts');
const decision = await server.ssrLoadModule('/src/services/webcodecs/formatDecision.ts');
const errors = await server.ssrLoadModule('/src/services/webcodecs/exportErrors.ts');
const { AudioExportError } = await server.ssrLoadModule('/src/services/webcodecs/AudioExportError.ts');
const { isLikelyVideoInput } = await server.ssrLoadModule('/src/services/webcodecs/inputValidation.ts');

const support = flags => ({ supported: true, h264: false, vp8: false, aac: false, opus: false, ...flags });

test('lazy deadline plans preserve the eager timing contract', () => {
    for (const fps of [1, 2, 24, 30, 60, 120]) {
        for (const duration of [0.001, 0.016667, 0.5, 1, 1.001, 2.5]) {
            const segments = [{ start: 0, end: duration }, { start: duration + 1, end: duration + 1.125 }];
            const sourceTimeline = timeline.createTimeline(segments, duration + 1.125);
            const eager = timeline.planDeadlines(sourceTimeline, fps);
            const lazyPlan = timeline.createDeadlinePlan(sourceTimeline, fps);
            const previous = [];
            for (const segment of sourceTimeline) {
                const durationUs = segment.outputEndUs - segment.outputStartUs;
                for (let index = 0; Math.round(index * 1_000_000 / fps) < durationUs; index++) {
                    const offsetUs = Math.round(index * 1_000_000 / fps);
                    const nextUs = Math.min(durationUs, Math.round((index + 1) * 1_000_000 / fps));
                    previous.push({
                        inputTime: segment.start + offsetUs / 1_000_000,
                        outputTimestampUs: segment.outputStartUs + offsetUs,
                        durationUs: nextUs - offsetUs,
                        isKeyframe: index % (fps * 2) === 0,
                    });
                }
            }
            assert.equal(lazyPlan.count, eager.length);
            assert.equal(lazyPlan.length, eager.length);
            assert.deepEqual(eager, previous);
            assert.deepEqual([...lazyPlan], eager);
        }
    }
    assert.throws(
        () => timeline.createDeadlinePlan([{ start: 0, end: 1, outputStartUs: 0, outputEndUs: Infinity }], 60),
        /finite/,
    );
});

test('representative lazy planning keeps exact frame counts and reports timing', () => {
    const measurements = [];
    for (const [duration, fps] of [[60, 24], [600, 30], [3600, 60]]) {
        const sourceTimeline = timeline.createTimeline([{ start: 0, end: duration }], duration);
        const started = performance.now();
        const plan = timeline.createDeadlinePlan(sourceTimeline, fps);
        let first = null;
        let last = null;
        let count = 0;
        for (const item of plan) {
            first ??= item;
            last = item;
            count++;
        }
        const elapsedMs = performance.now() - started;
        assert.equal(count, Math.round(duration * fps));
        assert.equal(first?.outputTimestampUs, 0);
        assert.equal(last?.outputTimestampUs + last?.durationUs, duration * 1_000_000);
        measurements.push(`${duration}s@${fps}fps=${count} frames/${elapsedMs.toFixed(3)}ms`);
    }
    console.log(`[export-roadmap] lazy deadline benchmark: ${measurements.join(', ')}`);
});

test('format resolution keeps requested choice, fallback reason and codecs aligned', () => {
    const chrome = support({ h264: true, aac: true });
    const firefox = support({ vp8: true, opus: true });
    const mixed = support({ h264: true, vp8: true, opus: true });

    assert.deepEqual(decision.resolveExportFormat('mp4', true, chrome), {
        requestedFormat: 'mp4', format: 'mp4', container: 'mp4', videoCodec: 'avc', audioCodec: 'aac', hasAudio: true, fallbackReason: null,
    });
    assert.equal(decision.resolveExportFormat('mp4', true, firefox).format, 'webm');
    assert.equal(decision.resolveExportFormat('mp4', true, firefox).audioCodec, 'opus');
    assert.equal(decision.resolveExportFormat('audio', true, firefox).container, 'webm');
    assert.equal(decision.resolveExportFormat('mp4', false, support({ h264: true })).format, 'mp4');
    assert.equal(decision.resolveExportFormat('mp4', true, mixed).fallbackReason, 'audio-codec-unavailable');
    assert.throws(() => decision.resolveExportFormat('mp4', true, support({})), error => {
        assert.equal(error.name, 'ExportCodecError');
        assert.equal(error.reason, 'video-codec-unavailable');
        return true;
    });
});

test('input hints accept empty MIME video files but leave decoding authoritative', () => {
    assert.equal(isLikelyVideoInput({ name: 'capture.webm', type: '', size: 10 }), true);
    assert.equal(isLikelyVideoInput({ name: 'capture.bin', type: '', size: 10 }), true);
    assert.equal(isLikelyVideoInput({ name: 'capture.bin', type: 'video/webm', size: 10 }), true);
    assert.equal(isLikelyVideoInput({ name: 'notes.txt', type: 'text/plain', size: 10 }), false);
    assert.equal(isLikelyVideoInput({ name: 'empty.webm', type: '', size: 0 }), false);
});

test('invalid input, unsupported codecs and audio encoding failures remain distinguishable', () => {
    const translate = key => `translated:${key}`;
    let codecError;
    try { decision.resolveExportFormat('mp4', true, support({})); }
    catch (error) { codecError = error; }
    assert.ok(codecError);
    assert.equal(errors.getExportFailureKind(new errors.ExportInputError()), 'invalid-input');
    assert.equal(errors.getExportFailureKind(codecError), 'unsupported-codec');
    assert.equal(errors.getExportFailureKind(new AudioExportError('encodeFailed')), 'audio');
    assert.equal(errors.getExportErrorMessage(new errors.ExportInputError(), translate, 'converter.error'), 'translated:export.input.invalid');
    assert.equal(errors.getExportErrorMessage(codecError, translate, 'converter.error'), 'translated:export.codec.unsupported');
    assert.equal(errors.getExportErrorMessage(new AudioExportError('encodeFailed'), translate, 'converter.error'), 'translated:export.audio.encodeFailed');
});
