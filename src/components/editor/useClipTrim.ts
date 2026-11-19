import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { TrimRange } from '../../types';
import { MIN_HANDLE_GAP_SECONDS } from './segmentsState';

type Edge = 'start' | 'end';
interface Args {
    segment: TrimRange;
    bounds: TrimRange;
    displayDuration: number;
    onTrim?: (start: number, end: number) => void;
}
interface Drag {
    pointerId: number;
    x: number;
    edge: Edge;
    original: TrimRange;
    secondsPerPixel: number;
    bounds: TrimRange;
}

export function trimEdge(original: TrimRange, bounds: TrimRange, edge: Edge, deltaSeconds: number): TrimRange {
    const gap = Math.min(MIN_HANDLE_GAP_SECONDS, original.end - original.start);
    const time = original[edge] + deltaSeconds;
    return edge === 'start'
        ? { start: Math.max(bounds.start, Math.min(time, original.end - gap)), end: original.end }
        : { start: original.start, end: Math.min(bounds.end, Math.max(time, original.start + gap)) };
}

export function trimAtPointer(drag: Drag, x: number): TrimRange {
    return trimEdge(drag.original, drag.bounds, drag.edge, (x - drag.x) * drag.secondsPerPixel);
}

export function useClipTrim({ segment, bounds, displayDuration, onTrim }: Args) {
    const drag = useRef<Drag | null>(null);
    const [preview, setPreview] = useState<TrimRange | null>(null);
    const stopClick = (event: { stopPropagation: () => void }) => event.stopPropagation();
    const begin = (edge: Edge, event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        event.preventDefault();
        if (!onTrim || event.button !== 0 || drag.current) return;
        const width = event.currentTarget.closest('.timeline-scrollable')?.scrollWidth ?? 0;
        if (width <= 0) return;
        // Freeze the scale: changing a ripple clip changes total sequence length.
        drag.current = { pointerId: event.pointerId, x: event.clientX, edge, original: { ...segment }, bounds: { ...bounds }, secondsPerPixel: displayDuration / width };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent<HTMLElement>) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        event.stopPropagation();
        setPreview(trimAtPointer(drag.current, event.clientX));
    };
    const finish = (event: PointerEvent<HTMLElement>, commit: boolean) => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        event.stopPropagation();
        drag.current = null;
        setPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (commit) {
            const result = trimAtPointer(active, event.clientX);
            if (result.start !== active.original.start || result.end !== active.original.end) onTrim?.(result.start, result.end);
        }
    };
    const handleProps = (edge: Edge) => ({
        onPointerDown: (event: PointerEvent<HTMLElement>) => begin(edge, event),
        onPointerMove: move,
        onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
        onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
        onLostPointerCapture: (event: PointerEvent<HTMLElement>) => finish(event, false),
        onClick: stopClick,
        style: { touchAction: 'none' as const },
    });
    return { preview, handleProps };
}
