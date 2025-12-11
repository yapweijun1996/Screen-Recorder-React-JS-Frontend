import React, { useRef, useState, useEffect } from 'react';

interface RangeSliderProps {
    min: number;
    max: number;
    start: number;
    end: number;
    onChange: (start: number, end: number) => void;
    onPreviewRequest?: (time: number) => void;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({
    min,
    max,
    start,
    end,
    onChange,
    onPreviewRequest
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

    const getPercent = (value: number) => {
        if (!Number.isFinite(max) || max === min) return 0;
        const p = ((value - min) / (max - min)) * 100;
        return Math.min(100, Math.max(0, p));
    };

    const handleMouseDown = (type: 'start' | 'end') => (e: React.MouseEvent) => {
        setIsDragging(type);
        e.preventDefault();
    };

    const handleInteraction = (clientX: number) => {
        if (!containerRef.current || !isDragging) return;
        if (!Number.isFinite(max)) return;

        const rect = containerRef.current.getBoundingClientRect();
        const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
        const value = (percent / 100) * (max - min) + min;

        let newStart = start;
        let newEnd = end;

        if (isDragging === 'start') {
            newStart = Math.min(value, end - 0.5); // Ensure min gap of 0.5s
            newStart = Math.max(newStart, min);
            onPreviewRequest?.(newStart);
        } else {
            newEnd = Math.max(value, start + 0.5); // Ensure min gap of 0.5s
            newEnd = Math.min(newEnd, max);
            onPreviewRequest?.(newEnd);
        }

        onChange(newStart, newEnd);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleInteraction(e.clientX);
        const handleTouchMove = (e: TouchEvent) => handleInteraction(e.touches[0].clientX);
        const handleEnd = () => setIsDragging(null);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleTouchMove);
            window.addEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging, start, end, max, min]);

    return (
        <div className="relative h-12 w-full flex items-center select-none touch-none" ref={containerRef}>
            {/* Background Track */}
            <div className="absolute w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                {/* Active Range Highlight */}
                <div
                    className="absolute h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    style={{
                        left: `${getPercent(start)}%`,
                        width: `${getPercent(end) - getPercent(start)}%`
                    }}
                />
            </div>

            {/* Start Handle */}
            <div
                className={`absolute h-7 w-4 bg-indigo-400 border-2 border-white rounded-sm cursor-ew-resize hover:scale-110 transition-transform shadow-lg z-10 flex items-center justify-center group ${isDragging === 'start' ? 'scale-110 ring-2 ring-indigo-300' : ''}`}
                style={{ left: `calc(${getPercent(start)}% - 8px)` }}
                onMouseDown={handleMouseDown('start')}
                onTouchStart={handleMouseDown('start')}
            >
                <div className="w-0.5 h-3 bg-indigo-800 opacity-50"></div>
                {/* Tooltip */}
                <div className="absolute -top-8 bg-slate-800 text-xs px-2 py-1 rounded text-white opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none shadow-lg">
                    Start
                </div>
            </div>

            {/* End Handle */}
            <div
                className={`absolute h-7 w-4 bg-purple-400 border-2 border-white rounded-sm cursor-ew-resize hover:scale-110 transition-transform shadow-lg z-10 flex items-center justify-center group ${isDragging === 'end' ? 'scale-110 ring-2 ring-purple-300' : ''}`}
                style={{ left: `calc(${getPercent(end)}% - 8px)` }}
                onMouseDown={handleMouseDown('end')}
                onTouchStart={handleMouseDown('end')}
            >
                <div className="w-0.5 h-3 bg-purple-800 opacity-50"></div>
                {/* Tooltip */}
                <div className="absolute -top-8 bg-slate-800 text-xs px-2 py-1 rounded text-white opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none shadow-lg">
                    End
                </div>
            </div>
        </div>
    );
};
