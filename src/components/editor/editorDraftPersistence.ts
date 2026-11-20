import type {
    ExportFormat,
    ExportFrameRateOption,
    ExportResolution,
    TrimRange,
    VideoQualityPreset,
} from '../../types';
import { readPreference, writePreference } from '../../services/preferenceStorage';
import { MAX_SEGMENTS } from './segmentsState';

export const EDITOR_DRAFT_VERSION = 1 as const;
const DRAFT_KEY_PREFIX = 'screenclip.editor-draft.v1:';
const TIME_EPSILON = 0.001;
const DURATION_TOLERANCE = 0.05;

export interface EditorDraftSnapshot {
    version: typeof EDITOR_DRAFT_VERSION;
    recordingId: string;
    duration: number;
    segments: TrimRange[];
    selectedIndex: number;
    selectedQuality: VideoQualityPreset;
    selectedResolution: ExportResolution;
    selectedFormat: ExportFormat;
    selectedFps: ExportFrameRateOption;
}

export type EditorDraftLoadStatus = 'none' | 'restored' | 'invalid';

export interface EditorDraftLoadResult {
    status: EditorDraftLoadStatus;
    draft: EditorDraftSnapshot | null;
}

const QUALITY_VALUES: readonly VideoQualityPreset[] = ['low', 'medium', 'high', 'lossless'];
const RESOLUTION_VALUES: readonly ExportResolution[] = ['original', '720p', '1080p', '4k'];
const FORMAT_VALUES: readonly ExportFormat[] = ['mp4', 'webm', 'audio'];
const FPS_VALUES: readonly ExportFrameRateOption[] = [24, 30, 60];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isOneOf<T extends string | number>(value: unknown, values: readonly T[]): value is T {
    return values.includes(value as T);
}

export function draftStorageKey(recordingId: string): string {
    return `${DRAFT_KEY_PREFIX}${encodeURIComponent(recordingId)}`;
}

/**
 * Validate untrusted persisted data before it can become export input.
 * Invalid ranges are rejected as a whole instead of being clamped into a
 * larger selection that could silently restore discarded source media.
 */
export function validateEditorDraft(
    value: unknown,
    recordingId: string,
    duration: number,
): EditorDraftSnapshot | null {
    if (!isRecord(value)
        || value.version !== EDITOR_DRAFT_VERSION
        || value.recordingId !== recordingId
        || !recordingId
        || !isFiniteNumber(duration)
        || duration <= 0
        || !isFiniteNumber(value.duration)
        || Math.abs(value.duration - duration) > DURATION_TOLERANCE
        || !Array.isArray(value.segments)
        || value.segments.length === 0
        || value.segments.length > MAX_SEGMENTS
        || !Number.isInteger(value.selectedIndex)
        || !isOneOf(value.selectedQuality, QUALITY_VALUES)
        || !isOneOf(value.selectedResolution, RESOLUTION_VALUES)
        || !isOneOf(value.selectedFormat, FORMAT_VALUES)
        || !isOneOf(value.selectedFps, FPS_VALUES)) {
        return null;
    }
    const selectedIndex = value.selectedIndex as number;

    const segments: TrimRange[] = [];
    for (const rawSegment of value.segments) {
        if (!isRecord(rawSegment) || !isFiniteNumber(rawSegment.start) || !isFiniteNumber(rawSegment.end)) {
            return null;
        }
        const start = Math.max(0, rawSegment.start);
        const end = Math.min(duration, rawSegment.end);
        const previous = segments.at(-1);
        if (rawSegment.start < -TIME_EPSILON
            || rawSegment.end > duration + TIME_EPSILON
            || end - start < 0.1
            || (previous && start < previous.end - TIME_EPSILON)) {
            return null;
        }
        segments.push({ start, end });
    }

    if (selectedIndex < 0 || selectedIndex >= segments.length) {
        return null;
    }

    return {
        version: EDITOR_DRAFT_VERSION,
        recordingId,
        duration,
        segments,
        selectedIndex,
        selectedQuality: value.selectedQuality,
        selectedResolution: value.selectedResolution,
        selectedFormat: value.selectedFormat,
        selectedFps: value.selectedFps,
    };
}

export function parseEditorDraft(raw: string | null, recordingId: string, duration: number): EditorDraftSnapshot | null {
    if (!raw) return null;
    try {
        return validateEditorDraft(JSON.parse(raw), recordingId, duration);
    } catch {
        return null;
    }
}

export function loadEditorDraft(recordingId: string | undefined, duration: number): EditorDraftLoadResult {
    if (!recordingId) return { status: 'none', draft: null };
    const raw = readPreference(draftStorageKey(recordingId));
    if (!raw) return { status: 'none', draft: null };
    const draft = parseEditorDraft(raw, recordingId, duration);
    return draft ? { status: 'restored', draft } : { status: 'invalid', draft: null };
}

export function saveEditorDraft(snapshot: EditorDraftSnapshot): boolean {
    const valid = validateEditorDraft(snapshot, snapshot.recordingId, snapshot.duration);
    if (!valid) return false;
    return writePreference(draftStorageKey(valid.recordingId), JSON.stringify(valid));
}

export function clearEditorDraft(recordingId: string | undefined): void {
    if (!recordingId || typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(draftStorageKey(recordingId));
    } catch {
        // Draft cleanup is best effort; the recording identity still isolates it.
    }
}
