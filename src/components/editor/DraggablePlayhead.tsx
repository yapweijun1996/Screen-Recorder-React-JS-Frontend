import React, { useCallback, useRef, useState } from 'react';
import { formatTime } from '../../utils/format';
import { sequenceTimeFromPixels } from './timelineCoordinates';

interface DraggablePlayheadProps {
    currentTime: number;
    maxDuration: number;
    timelineRef: React.RefObject<HTMLElement | null>;
    interactive?: boolean;
    onSeek: (time: number) => void;
    trackHeight?: number;
    className?: string;
}

/**
 * Final Cut Pro 风格的可拖拽播放头
 * - 顶部显示时间标签
 * - 支持拖拽跳转
 * - 红色竖线贯穿轨道
 */
export const DraggablePlayhead: React.FC<DraggablePlayheadProps> = ({
    currentTime,
    maxDuration,
    timelineRef,
    interactive = true,
    onSeek,
    trackHeight = 80,
    className = '',
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const pointerIdRef = useRef<number | null>(null);
    const dragStartXRef = useRef(0);
    const dragStartTimeRef = useRef(0);
    const dragStartScrollLeftRef = useRef(0);
    const dragStartTrackWidthRef = useRef(0);

    const safeMax = Math.max(maxDuration, 0.0001);
    const leftPct = Math.min(100, Math.max(0, (currentTime / safeMax) * 100));

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const timeline = timelineRef.current;
        if (!interactive || !timeline || e.button !== 0 || pointerIdRef.current !== null) return;
        e.preventDefault();
        e.stopPropagation();
        pointerIdRef.current = e.pointerId;
        setIsDragging(true);
        dragStartXRef.current = e.clientX;
        dragStartTimeRef.current = currentTime;
        dragStartScrollLeftRef.current = timeline.scrollLeft;
        dragStartTrackWidthRef.current = timeline.scrollWidth;
        e.currentTarget.setPointerCapture(e.pointerId);
    }, [currentTime, interactive, timelineRef]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (pointerIdRef.current !== e.pointerId || !timelineRef.current) return;

        const timeline = timelineRef.current;
        const trackWidth = dragStartTrackWidthRef.current;

        // 计算新的时间位置
        const scrollDelta = timeline.scrollLeft - dragStartScrollLeftRef.current;
        const deltaX = e.clientX - dragStartXRef.current + scrollDelta;
        const newTime = sequenceTimeFromPixels(deltaX, trackWidth, safeMax, dragStartTimeRef.current);

        onSeek(newTime);
    }, [timelineRef, safeMax, onSeek]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (pointerIdRef.current !== e.pointerId) return;
        pointerIdRef.current = null;
        setIsDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    }, []);

    return (
        <div
            className={`absolute top-0 z-30 ${className}`}
            style={{
                left: `${leftPct}%`,
                height: `${trackHeight}px`,
                transform: 'translateX(-50%)',
            }}
        >
            {/* 顶部拖拽手柄 + 时间标签 */}
            <div
                className={`
                    absolute -top-6 left-1/2 -translate-x-1/2 cursor-grab
                    ${isDragging ? 'cursor-grabbing scale-110' : 'hover:scale-105'}
                    transition-transform
                `}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={handlePointerUp}
            >
                {/* 时间标签 */}
                <div className={`
                    bg-red-600 text-white text-[10px] font-mono font-bold 
                    px-1.5 py-0.5 rounded-sm shadow-lg whitespace-nowrap
                    border border-red-400
                    ${isDragging ? 'ring-2 ring-red-400/50' : ''}
                `}>
                    {formatTime(currentTime)}
                </div>
                {/* 小三角箭头 */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-red-600" />
            </div>

            {/* 竖线 */}
            <div
                className={`
                    w-[2px] h-full bg-red-600 
                    shadow-[0_0_8px_rgba(239,68,68,0.6),_0_0_2px_rgba(255,255,255,0.3)]
                    ${isDragging ? 'w-[3px]' : ''}
                `}
            />

            {/* 底部小圆点 */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-600 rounded-full shadow-lg border border-red-400" />
        </div>
    );
};
