import type { TrimRange } from '../../types';

const MIN_HANDLE_GAP_SECONDS = 0.5;
const MIN_KEEP_SEGMENT_SECONDS = 0.1;
const MIN_REMOVE_RANGE_SECONDS = 0.1;
const MAX_HISTORY = 20;
const MERGE_EPSILON = 0.001;

export interface SegmentsState {
    segments: TrimRange[];
    selectedIndex: number;
    history: TrimRange[][];
}

export type SegmentAction =
    | { type: 'select'; index: number }
    | { type: 'undo' }
    | { type: 'split'; time: number }
    | { type: 'update' | 'remove'; start: number; end: number; duration: number }
    | { type: 'delete' | 'reset' | 'syncDuration'; duration: number };

export const createSegmentsState = (duration: number): SegmentsState => ({
    segments: [{ start: 0, end: duration }], selectedIndex: 0, history: [],
});
const clampIndex = (index: number, segments: TrimRange[]) => Math.max(0, Math.min(index, segments.length - 1));

function commit(state: SegmentsState, segments: TrimRange[], index = state.selectedIndex): SegmentsState {
    if (segments.length === state.segments.length && segments.every((segment, i) =>
        segment.start === state.segments[i].start && segment.end === state.segments[i].end)) return state;
    return {
        segments, selectedIndex: clampIndex(index, segments),
        history: [...state.history.slice(-(MAX_HISTORY - 1)), state.segments],
    };
}

// Segment edits and undo history share one atomic state update. This also keeps
// React's repeated updater checks from recording the same edit twice.
export function segmentsReducer(state: SegmentsState, action: SegmentAction): SegmentsState {
    const { segments, selectedIndex: index } = state;
    const selected = segments[index];
    switch (action.type) {
        case 'select': return { ...state, selectedIndex: clampIndex(action.index, segments) };
        case 'undo': {
            const previous = state.history.at(-1);
            return previous ? { segments: previous, selectedIndex: clampIndex(index, previous), history: state.history.slice(0, -1) } : state;
        }
        case 'split': {
            if (!selected || !Number.isFinite(action.time)) return state;
            const time = Math.max(selected.start, Math.min(action.time, selected.end));
            if (time - selected.start < MIN_HANDLE_GAP_SECONDS || selected.end - time < MIN_HANDLE_GAP_SECONDS) return state;
            return commit(state, [...segments.slice(0, index), { start: selected.start, end: time }, { start: time, end: selected.end }, ...segments.slice(index + 1)], index + 1);
        }
        case 'update': {
            if (!selected) return state;
            const previousEnd = index > 0 ? segments[index - 1].end : 0;
            const nextStart = index < segments.length - 1 ? segments[index + 1].start : action.duration;
            const start = Math.max(previousEnd, Math.min(action.start, nextStart - MIN_HANDLE_GAP_SECONDS));
            const end = Math.min(nextStart, Math.max(action.end, previousEnd + MIN_HANDLE_GAP_SECONDS));
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return state;
            return commit(state, segments.map((segment, i) => i === index ? { start, end } : segment));
        }
        case 'delete': return commit(state, segments.length > 1 ? segments.filter((_, i) => i !== index) : [{ start: 0, end: action.duration }], index - 1);
        case 'reset': return commit(state, [{ start: 0, end: action.duration }], 0);
        case 'syncDuration': {
            if (state.history.length || segments.length !== 1 || selected.start !== 0 || !Number.isFinite(action.duration) || action.duration <= 0) return state;
            if (Math.abs(selected.end - action.duration) <= 1 && selected.end !== 0) return state;
            return { ...state, segments: [{ start: 0, end: action.duration }] };
        }
        case 'remove': {
            const start = Math.min(action.start, action.end), end = Math.max(action.start, action.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_REMOVE_RANGE_SECONDS) return state;
            const cut: TrimRange[] = [];
            for (const segment of segments) {
                if (end <= segment.start || start >= segment.end) cut.push(segment);
                else {
                    if (start > segment.start) cut.push({ start: segment.start, end: Math.min(start, segment.end) });
                    if (end < segment.end) cut.push({ start: Math.max(end, segment.start), end: segment.end });
                }
            }
            const filtered = cut.map(segment => ({
                start: Math.max(0, Math.min(segment.start, action.duration)), end: Math.max(0, Math.min(segment.end, action.duration)),
            })).filter(segment => segment.end - segment.start >= MIN_KEEP_SEGMENT_SECONDS).sort((a, b) => a.start - b.start);
            const merged: TrimRange[] = [];
            for (const segment of filtered) {
                const last = merged.at(-1);
                if (last && segment.start <= last.end + MERGE_EPSILON) last.end = Math.max(last.end, segment.end);
                else merged.push(segment);
            }
            return commit(state, merged.length ? merged : [{ start: 0, end: action.duration }]);
        }
    }
}
