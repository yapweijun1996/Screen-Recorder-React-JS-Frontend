import { createContext, useContext, useReducer, useState, type PropsWithChildren } from 'react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../types';
import { createSegmentsState, segmentsReducer } from './segmentsState';

function useDraft(duration: number) {
    const [segmentState, dispatchSegments] = useReducer(segmentsReducer, duration, createSegmentsState);
    const [currentTime, setCurrentTime] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [selectedQuality, setSelectedQuality] = useState<VideoQualityPreset>('medium');
    const [selectedResolution, setSelectedResolution] = useState<ExportResolution>('original');
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');
    const [selectedFps, setSelectedFps] = useState<ExportFrameRateOption>(30);
    return {
        segmentState, dispatchSegments,
        currentTime, setCurrentTime, showAdvanced, setShowAdvanced,
        selectedQuality, setSelectedQuality, selectedResolution, setSelectedResolution,
        selectedFormat, setSelectedFormat, selectedFps, setSelectedFps,
    };
}

const EditorDraftContext = createContext<ReturnType<typeof useDraft> | null>(null);

// App keys this provider by recording URL. Navigation retains the draft;
// replacing or clearing the recording creates a fresh draft automatically.
export function EditorDraftProvider({ duration, children }: PropsWithChildren<{ duration: number }>) {
    const draft = useDraft(duration);
    return <EditorDraftContext.Provider value={draft}>{children}</EditorDraftContext.Provider>;
}

export function useEditorDraft() {
    const draft = useContext(EditorDraftContext);
    if (!draft) throw new Error('EditorDraftProvider is required');
    return draft;
}
