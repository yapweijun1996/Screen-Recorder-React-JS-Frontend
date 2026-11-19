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

export interface LazyDeadlinePlan extends Iterable<Deadline> {
    /** Number of deadlines without materializing every frame object. */
    readonly count: number;
    /** Array-compatible name for callers that only need the total. */
    readonly length: number;
}

function assertValidFps(targetFps: number) {
    if (!Number.isFinite(targetFps) || targetFps <= 0) throw new RangeError('FPS must be finite and positive');
}

function countSegmentDeadlines(durationUs: number, targetFps: number): number {
    // The same rounded boundary rule is used by the iterator below. Keeping
    // this calculation separate lets progress reporting avoid a frame array.
    if (!Number.isFinite(durationUs)) throw new RangeError('Timeline duration must be finite');
    if (durationUs <= 0) return 0;
    let count = Math.max(1, Math.ceil((durationUs - 0.5) * targetFps / 1_000_000));
    if (!Number.isSafeInteger(count)) throw new RangeError('Deadline count exceeds the safe integer range');
    // Correct the rare floating-point/tie cases while still avoiding a scan
    // proportional to the number of output frames.
    while (Math.round(count * 1_000_000 / targetFps) < durationUs) {
        if (count === Number.MAX_SAFE_INTEGER) throw new RangeError('Deadline count exceeds the safe integer range');
        count++;
    }
    while (count > 0 && Math.round((count - 1) * 1_000_000 / targetFps) >= durationUs) count--;
    return count;
}

export function countDeadlines(timeline: TimelineSegment[], targetFps: number): number {
    assertValidFps(targetFps);
    let total = 0;
    for (const segment of timeline) {
        const durationUs = segment.outputEndUs - segment.outputStartUs;
        total += countSegmentDeadlines(durationUs, targetFps);
        if (!Number.isSafeInteger(total)) throw new RangeError('Deadline count exceeds the safe integer range');
    }
    return total;
}

export function* iterateDeadlines(timeline: TimelineSegment[], targetFps: number): Generator<Deadline> {
    assertValidFps(targetFps);
    for (const segment of timeline) {
        const durationUs = segment.outputEndUs - segment.outputStartUs;
        const frameCount = countSegmentDeadlines(durationUs, targetFps);
        for (let index = 0; index < frameCount; index++) {
            const offsetUs = Math.round(index * 1_000_000 / targetFps);
            const nextUs = Math.min(durationUs, Math.round((index + 1) * 1_000_000 / targetFps));
            yield {
                inputTime: segment.start + offsetUs / 1_000_000,
                outputTimestampUs: segment.outputStartUs + offsetUs,
                durationUs: nextUs - offsetUs,
                isKeyframe: index % (targetFps * 2) === 0,
            };
        }
    }
}

export function createDeadlinePlan(timeline: TimelineSegment[], targetFps: number): LazyDeadlinePlan {
    const count = countDeadlines(timeline, targetFps);
    return {
        count,
        length: count,
        [Symbol.iterator]: () => iterateDeadlines(timeline, targetFps),
    };
}

/**
 * Preserve the historical eager API for existing callers and tests. New
 * export paths should use createDeadlinePlan so long jobs do not retain one
 * object per output frame.
 */
export function planDeadlines(timeline: TimelineSegment[], targetFps: number): Deadline[] {
    return [...iterateDeadlines(timeline, targetFps)];
}
