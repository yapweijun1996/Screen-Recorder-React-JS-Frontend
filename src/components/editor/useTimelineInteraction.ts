import { useRef, useState, useCallback, useMemo } from 'react';
import type React from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';
import type { TimelineToolMode } from './TimelineToolbar';

interface InteractionArgs {
    maxDuration: number;
    segments: TrimRange[];
    totalSelectedDuration: number;
    skimmingEnabled: boolean;
    onSeek: (time: number) => void;
    onSplitAt?: (time: number, index?: number) => void;
}

export function useTimelineInteraction({ maxDuration, segments, totalSelectedDuration, skimmingEnabled, onSeek, onSplitAt }: InteractionArgs) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [activeTool, setActiveTool] = useState<TimelineToolMode>('select');
    const [skimTime, setSkimTime] = useState<number | null>(null);
    const [scrollLeft, setScrollLeft] = useState(0);

    const safeMax = Math.max(maxDuration, 0.0001);

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

    const toPct = useCallback((time: number) => {
        return Math.min(100, Math.max(0, (time / displayDuration) * 100));
    }, [displayDuration]);

    // Hover indicator
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!skimmingEnabled || activeTool !== 'select') {
            setSkimTime(null);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        const scrollableArea = container.querySelector('.timeline-scrollable');
        if (!scrollableArea) return;

        const rect = scrollableArea.getBoundingClientRect();
        const scrollOffset = scrollableArea.scrollLeft;
        const x = e.clientX - rect.left + scrollOffset;
        const totalWidth = scrollableArea.scrollWidth;
        const timePct = x / totalWidth;
        const time = timePct * displayDuration;

        setSkimTime(Math.max(0, Math.min(displayDuration, time)));
    }, [skimmingEnabled, activeTool, displayDuration]);

    const handleMouseLeave = useCallback(() => {
        setSkimTime(null);
    }, []);

    // Seek or split at the clicked sequence position.
    const handleTimelineClick = useCallback((e: React.MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;

        const scrollableArea = container.querySelector('.timeline-scrollable');
        if (!scrollableArea) return;

        const rect = scrollableArea.getBoundingClientRect();
        const scrollOffset = scrollableArea.scrollLeft;
        const x = e.clientX - rect.left + scrollOffset;
        const totalWidth = scrollableArea.scrollWidth;
        const timePct = x / totalWidth;
        const seqTime = Math.max(0, Math.min(displayDuration, timePct * displayDuration));
        const sourceTime = sequenceToSource(seqTime);

        if (activeTool === 'blade') {
            // Blade tool
            const index = segments.findIndex(segment => sourceTime > segment.start && sourceTime < segment.end);
            if (index >= 0) onSplitAt?.(sourceTime, index);
        } else {
            // Selection tool
            onSeek(sourceTime);
        }
    }, [activeTool, displayDuration, sequenceToSource, segments, onSeek, onSplitAt]);

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

    return { containerRef, zoomLevel, activeTool, setActiveTool, skimTime, setScrollLeft, displayDuration, collapsedSegments, sourceToSequence, sequenceToSource, handleZoomIn, handleZoomOut, handleZoomReset, timelineWidthPct, toPct, handleMouseMove, handleMouseLeave, handleTimelineClick, ticks };
}
