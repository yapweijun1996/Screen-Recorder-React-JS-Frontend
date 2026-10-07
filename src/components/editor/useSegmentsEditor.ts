import { useState } from 'react';
import { useEditorDraft } from './EditorDraftContext';

export const useSegmentsEditor = ({ maxDuration }: { maxDuration: number }) => {
    const { segmentState, dispatchSegments } = useEditorDraft();
    const { segments: safeSegments, selectedIndex, history } = segmentState;
    // Preview playback is transient; the actual edit and undo history persist.
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const selectedSegment = safeSegments[selectedIndex];
    const activeSegment = safeSegments[previewIndex ?? selectedIndex];
    const selectIndex = (index: number) => { dispatchSegments({ type: 'select', index }); setPreviewIndex(null); };
    const updateSelectedSegment = (start: number, end: number) => dispatchSegments({ type: 'update', start, end, duration: maxDuration });
    const splitSelectedAt = (time: number, index?: number) => { dispatchSegments({ type: 'split', time, index }); setPreviewIndex(null); };
    const deleteSelectedSegment = () => { dispatchSegments({ type: 'delete', duration: maxDuration }); setPreviewIndex(null); };
    const removeInterval = (start: number, end: number) => { dispatchSegments({ type: 'remove', start, end, duration: maxDuration }); setPreviewIndex(null); };
    const undo = () => { dispatchSegments({ type: 'undo' }); setPreviewIndex(null); };
    const resetSegments = () => { dispatchSegments({ type: 'reset', duration: maxDuration }); setPreviewIndex(null); };

    return {
        safeSegments, selectedSegment, activeSegment, selectedIndex, previewIndex,
        totalSelectedDuration: safeSegments.reduce((sum, segment) => sum + Math.max(segment.end - segment.start, 0), 0),
        canUndo: history.length > 0, setPreviewIndex, selectIndex,
        setSelectedIndexDirect: (index: number) => dispatchSegments({ type: 'select', index }),
        updateSelectedSegment, splitSelectedAt, deleteSelectedSegment, removeInterval, undo, resetSegments,
        syncDurationIfUntouched: (duration: number) => dispatchSegments({ type: 'syncDuration', duration }),
    };
};
