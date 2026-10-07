export interface TimelineSegment {
    start: number;
    end: number;
    outputStartUs: number;
    outputEndUs: number;
}

// Round cumulative boundaries once. Rounding each cut independently adds drift.
export function createTimeline(segments: Array<{ start: number; end: number }>, duration: number): TimelineSegment[] {
    let seconds = 0;
    return segments.flatMap(segment => {
        const start = Math.max(0, Math.min(duration, segment.start));
        const end = Math.max(start, Math.min(duration, segment.end));
        if (end <= start) return [];
        const outputStartUs = Math.round(seconds * 1_000_000);
        seconds += end - start;
        const outputEndUs = Math.round(seconds * 1_000_000);
        return outputEndUs > outputStartUs ? [{ start, end, outputStartUs, outputEndUs }] : [];
    });
}

export interface Deadline {
    inputTime: number;
    outputTimestampUs: number;
    durationUs: number;
    isKeyframe: boolean;
}

export function planDeadlines(timeline: TimelineSegment[], targetFps: number): Deadline[] {
    if (!Number.isFinite(targetFps) || targetFps <= 0) throw new RangeError('FPS must be finite and positive');
    const deadlines: Deadline[] = [];
    for (const segment of timeline) {
        const durationUs = segment.outputEndUs - segment.outputStartUs;
        for (let index = 0; Math.round(index * 1_000_000 / targetFps) < durationUs; index++) {
            const offsetUs = Math.round(index * 1_000_000 / targetFps);
            const nextUs = Math.min(durationUs, Math.round((index + 1) * 1_000_000 / targetFps));
            deadlines.push({
                inputTime: segment.start + offsetUs / 1_000_000,
                outputTimestampUs: segment.outputStartUs + offsetUs,
                durationUs: nextUs - offsetUs,
                isKeyframe: index % (targetFps * 2) === 0,
            });
        }
    }
    return deadlines;
}
