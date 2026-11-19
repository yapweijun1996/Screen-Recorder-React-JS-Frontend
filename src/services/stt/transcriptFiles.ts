import type { Cue } from './protocol';

export type TranscriptFormat = 'srt' | 'txt';

function formatSrtTime(seconds: number) {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor(milliseconds / 60_000) % 60;
    const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
    const fraction = milliseconds % 1000;
    return [hours, minutes, wholeSeconds].map(unit => String(unit).padStart(2, '0')).join(':')
        + ',' + String(fraction).padStart(3, '0');
}

export function serializeTranscript(cues: Cue[], format: TranscriptFormat): string {
    const blocks = cues.flatMap(cue => {
        const text = cue.text.trim().replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, '\n');
        return text ? [{ ...cue, text }] : [];
    });
    if (format === 'txt') return blocks.map(cue => cue.text).join('\n') + (blocks.length ? '\n' : '');
    return blocks.map((cue, index) => {
        const end = Math.max(cue.end, cue.start + 0.001);
        return `${index + 1}\r\n${formatSrtTime(cue.start)} --> ${formatSrtTime(end)}\r\n${cue.text.replace(/\n/g, '\r\n')}\r\n`;
    }).join('\r\n');
}
