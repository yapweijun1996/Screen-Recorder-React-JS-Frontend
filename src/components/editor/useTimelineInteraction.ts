import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import type React from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';
import type { TimelineToolMode } from './TimelineToolbar';
import { sequenceTimeFromPixels } from './timelineCoordinates';
import { canHandleEditorShortcut } from './editorShortcutTarget';

interface InteractionArgs {
    segments: TrimRange[];
    totalSelectedDuration: number;
    skimmingEnabled: boolean;
    onSeek: (time: number) => void;
    onSplitAt?: (time: number, index?: number) => void;
}

export function calculateHandScrollLeft(startScrollLeft: number, deltaPixels: number, maxScrollLeft: number) {
    return Math.max(0, Math.min(maxScrollLeft, startScrollLeft - deltaPixels));
}

export function useTimelineInteraction({ segments, totalSelectedDuration, skimmingEnabled, onSeek, onSplitAt }: InteractionArgs) {
    const scrollableRef = useRef<HTMLDivElement>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [activeTool, setActiveTool] = useState<TimelineToolMode>('select');
    const [skimTime, setSkimTime] = useState<number | null>(null);
    const [isHandDragging, setIsHandDragging] = useState(false);
    const handDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);

    // Collapsed timeline: display segments sequentially from 0 (ripple mode)
    const displayDuration = Math.max(totalSelectedDuration, 0.0001);

    const collapsedSegments = useMemo(() => {
        let offset = 0;
        return segments.map(seg => {
            const duration = seg.end - seg.start;
            const result = {
                sourceStart: seg.start,
                sourceEnd: seg.end,
                displayStart: offset,
                displayEnd: offset + duration,
            };
            offset += duration;
            return result;
        });
    }, [segments]);

    // Source time → Sequence time (for display)
    const sourceToSequence = useCallback((sourceTime: number): number => {
        let seqTime = 0;
        for (const seg of segments) {
            if (sourceTime < seg.start) break;
            if (sourceTime <= seg.end) {
                seqTime += sourceTime - seg.start;
                return seqTime;
            }
            seqTime += seg.end - seg.start;
        }
        return seqTime;
    }, [segments]);

    // Sequence time → Source time (for seeking)
    const sequenceToSource = useCallback((seqTime: number): number => {
        let remaining = Math.max(0, seqTime);
        for (const seg of segments) {
            const segDuration = seg.end - seg.start;
            if (remaining <= segDuration) {
                return seg.start + remaining;
            }
            remaining -= segDuration;
        }
        return segments.length > 0 ? segments[segments.length - 1].end : 0;
    }, [segments]);

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        setZoomLevel((prev) => Math.min(prev * 1.5, 10));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoomLevel((prev) => Math.max(prev / 1.5, 0.5));
    }, []);

    const handleZoomReset = useCallback(() => {
        setZoomLevel(1);
    }, []);

    // Timeline width follows the zoom level.
    const timelineWidthPct = useMemo(() => {
        return 100 * zoomLevel;
    }, [zoomLevel]);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (!canHandleEditorShortcut(event) || event.ctrlKey || event.metaKey) return;
            if (event.code !== 'KeyH' && event.code !== 'KeyA') return;
            event.preventDefault();
            setActiveTool(event.code === 'KeyH' ? 'hand' : 'select');
        };

        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, []);

    const handleHandPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (activeTool !== 'hand' || event.button !== 0 || handDragRef.current) return;
        const scrollable = scrollableRef.current;
        if (!scrollable || scrollable.scrollWidth <= scrollable.clientWidth) return;
        handDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: scrollable.scrollLeft,
        };
        setIsHandDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }, [activeTool]);

    const handleHandPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = handDragRef.current;
        const scrollable = scrollableRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !scrollable) return;
        const maxScrollLeft = Math.max(0, scrollable.scrollWidth - scrollable.clientWidth);
        scrollable.scrollLeft = calculateHandScrollLeft(
            drag.startScrollLeft,
            event.clientX - drag.startX,
            maxScrollLeft,
        );
        event.preventDefault();
    }, []);

    const handleHandPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = handDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        handDragRef.current = null;
        setIsHandDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const toPct = useCallback((time: number) => {
        return Math.min(100, Math.max(0, (time / displayDuration) * 100));
    }, [displayDuration]);

    const pointerTime = useCallback((clientX: number) => {
        const timeline = scrollableRef.current;
        if (!timeline) return null;
        const offset = clientX - timeline.getBoundingClientRect().left + timeline.scrollLeft;
        return sequenceTimeFromPixels(offset, timeline.scrollWidth, displayDuration);
    }, [displayDuration]);

    // Hover indicator
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!skimmingEnabled || activeTool !== 'select') {
            setSkimTime(null);
            return;
        }

        setSkimTime(pointerTime(e.clientX));
    }, [skimmingEnabled, activeTool, pointerTime]);

    const handleMouseLeave = useCallback(() => {
        setSkimTime(null);
    }, []);

    // Seek or split at the clicked sequence position.
    const handleTimelineClick = useCallback((e: React.MouseEvent) => {
        if (activeTool === 'hand') return;
        const seqTime = pointerTime(e.clientX);
        if (seqTime === null) return;
        const sourceTime = sequenceToSource(seqTime);

        if (activeTool === 'blade') {
            // Blade tool
            const index = segments.findIndex(segment => sourceTime > segment.start && sourceTime < segment.end);
            if (index >= 0) onSplitAt?.(sourceTime, index);
        } else {
            // Selection tool
            onSeek(sourceTime);
        }
    }, [activeTool, pointerTime, sequenceToSource, segments, onSeek, onSplitAt]);

    // Ruler ticks
    const ticks = useMemo(() => {
        const result: Array<{ time: number; isMajor: boolean; label?: string }> = [];

        // Increase tick density when zoomed in.
        const baseInterval = zoomLevel >= 3 ? 1 : zoomLevel >= 1.5 ? 5 : 10;
        const majorInterval = baseInterval * 5;

        for (let t = 0; t <= displayDuration; t += baseInterval) {
            const isMajor = t % majorInterval < 0.001;
            result.push({
                time: t,
                isMajor,
                label: isMajor ? formatTime(t) : undefined,
            });
        }

        return result;
    }, [displayDuration, zoomLevel]);

    return {
        scrollableRef,
        zoomLevel,
        activeTool,
        setActiveTool,
        isHandDragging,
        skimTime,
        handleHandPointerDown,
        handleHandPointerMove,
        handleHandPointerEnd,
        displayDuration,
        collapsedSegments,
        sourceToSequence,
        sequenceToSource,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
        timelineWidthPct,
        toPct,
        handleMouseMove,
        handleMouseLeave,
        handleTimelineClick,
        ticks,
    };
}
