import { createContext, useContext, useEffect, useReducer, useRef, useState, type PropsWithChildren } from 'react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../types';
import { createSegmentsState, segmentsReducer, type SegmentAction } from './segmentsState';
import { loadEditorDraft, saveEditorDraft } from './editorDraftPersistence';

function useDraft(duration: number, recordingId?: string) {
    const [draftLoad] = useState(() => loadEditorDraft(recordingId, duration));
    const restoredDraft = draftLoad.draft;
    const [segmentState, dispatchSegments] = useReducer(
        segmentsReducer,
        { duration, restoredDraft },
        ({ duration: initialDuration, restoredDraft: initialDraft }) => initialDraft
            ? {
                segments: initialDraft.segments.map(segment => ({ ...segment })),
                selectedIndex: initialDraft.selectedIndex,
                history: [],
            }
            : createSegmentsState(initialDuration),
    );
    const [currentTime, setCurrentTime] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [selectedQualityState, setSelectedQualityState] = useState<VideoQualityPreset>(() => restoredDraft?.selectedQuality ?? 'medium');
    const [selectedResolutionState, setSelectedResolutionState] = useState<ExportResolution>(() => restoredDraft?.selectedResolution ?? 'original');
    const [selectedFormatState, setSelectedFormatState] = useState<ExportFormat>(() => restoredDraft?.selectedFormat ?? 'mp4');
    const [selectedFpsState, setSelectedFpsState] = useState<ExportFrameRateOption>(() => restoredDraft?.selectedFps ?? 30);
    const [draftDirtyVersion, setDraftDirtyVersion] = useState(0);
    const [draftBlocked, setDraftBlocked] = useState(draftLoad.status === 'invalid');
    const persistedSignature = useRef<string | null>(null);
    const persistedDirtyVersion = useRef(0);
    const forcePersist = useRef(false);

    const markDraftDirty = () => setDraftDirtyVersion(version => version + 1);
    const dispatchDraftAction = (action: SegmentAction) => {
        if (action.type !== 'syncDuration' && segmentsReducer(segmentState, action) !== segmentState) markDraftDirty();
        dispatchSegments(action);
    };
    const setSelectedQuality = (value: VideoQualityPreset) => {
        if (value !== selectedQualityState) markDraftDirty();
        setSelectedQualityState(value);
    };
    const setSelectedResolution = (value: ExportResolution) => {
        if (value !== selectedResolutionState) markDraftDirty();
        setSelectedResolutionState(value);
    };
    const setSelectedFormat = (value: ExportFormat) => {
        if (value !== selectedFormatState) markDraftDirty();
        setSelectedFormatState(value);
    };
    const setSelectedFps = (value: ExportFrameRateOption) => {
        if (value !== selectedFpsState) markDraftDirty();
        setSelectedFpsState(value);
    };
    const acknowledgeDraftRecovery = () => {
        forcePersist.current = true;
        setDraftBlocked(false);
    };

    const durableSignature = JSON.stringify({
        segments: segmentState.segments,
        selectedIndex: segmentState.selectedIndex,
        selectedQuality: selectedQualityState,
        selectedResolution: selectedResolutionState,
        selectedFormat: selectedFormatState,
        selectedFps: selectedFpsState,
    });

    useEffect(() => {
        if (!recordingId || !Number.isFinite(duration) || duration <= 0) return;
        // Never write a full-range fallback on mount. This leaves another tab's
        // same-recording draft untouched until this tab makes an edit.
        if (draftBlocked) return;
        if (draftDirtyVersion === 0 && !forcePersist.current) {
            persistedSignature.current = durableSignature;
            persistedDirtyVersion.current = draftDirtyVersion;
            return;
        }
        if (!forcePersist.current
            && persistedDirtyVersion.current === draftDirtyVersion
            && persistedSignature.current === durableSignature) return;
        saveEditorDraft({
            version: 1,
            recordingId,
            duration,
            segments: segmentState.segments,
            selectedIndex: segmentState.selectedIndex,
            selectedQuality: selectedQualityState,
            selectedResolution: selectedResolutionState,
            selectedFormat: selectedFormatState,
            selectedFps: selectedFpsState,
        });
        persistedSignature.current = durableSignature;
        persistedDirtyVersion.current = draftDirtyVersion;
        forcePersist.current = false;
    }, [recordingId, duration, draftBlocked, draftDirtyVersion, durableSignature, segmentState]);

    return {
        segmentState, dispatchSegments: dispatchDraftAction,
        currentTime, setCurrentTime, showAdvanced, setShowAdvanced,
        selectedQuality: selectedQualityState, setSelectedQuality,
        selectedResolution: selectedResolutionState, setSelectedResolution,
        selectedFormat: selectedFormatState, setSelectedFormat,
        selectedFps: selectedFpsState, setSelectedFps,
        draftBlocked, acknowledgeDraftRecovery,
    };
}

const EditorDraftContext = createContext<ReturnType<typeof useDraft> | null>(null);

// Navigation retains the draft for the same recording identity. A replacement
// recording receives a new provider instance and cannot inherit old edits.
export function EditorDraftProvider({ duration, recordingId, children }: PropsWithChildren<{ duration: number; recordingId?: string }>) {
    const draft = useDraft(duration, recordingId);
    return <EditorDraftContext.Provider value={draft}>{children}</EditorDraftContext.Provider>;
}

export function useEditorDraft() {
    const draft = useContext(EditorDraftContext);
    if (!draft) throw new Error('EditorDraftProvider is required');
    return draft;
}
