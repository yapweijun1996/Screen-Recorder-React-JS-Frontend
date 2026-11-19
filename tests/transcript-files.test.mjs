import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { serializeTranscript } = await server.ssrLoadModule('/src/services/stt/transcriptFiles.ts');

test('SRT serializes edited multilingual cues with millisecond source time', () => {
    const cues = [
        { id: 'a', start: 0.3246, end: 1.1, text: 'Hello' },
        { id: 'blank', start: 2, end: 3, text: ' ' },
        { id: 'b', start: 3661.005, end: 3662, text: '\u4f60\u597d\n\nWorld' },
    ];
    assert.equal(
        serializeTranscript(cues, 'srt'),
        '1\r\n00:00:00,325 --> 00:00:01,100\r\nHello\r\n\r\n'
        + '2\r\n01:01:01,005 --> 01:01:02,000\r\n\u4f60\u597d\r\nWorld\r\n',
    );
    assert.equal(serializeTranscript(cues, 'txt'), 'Hello\n\u4f60\u597d\nWorld\n');
});

test('empty text produces no file contents and submillisecond cues remain visible', () => {
    assert.equal(serializeTranscript([], 'srt'), '');
    assert.equal(serializeTranscript([{ id: 'a', start: 1, end: 1.00001, text: 'A' }], 'srt'),
        '1\r\n00:00:01,000 --> 00:00:01,001\r\nA\r\n');
});
