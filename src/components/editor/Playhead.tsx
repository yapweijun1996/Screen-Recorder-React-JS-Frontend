import React from 'react';
import { formatTime } from '../../utils/format';

interface PlayheadProps {
    currentTime: number;
    maxDuration: number;
    /** 播放头所在容器的高度（用于绘制竖线） */
    trackHeight?: number;
    className?: string;
}

/**
 * 独立的播放头组件（Playhead）
 * - 显示当前时间位置的竖线
 * - 顶部显示时间标签
 * - 可拖拽（由父组件处理）
 */
export const Playhead: React.FC<PlayheadProps> = ({
    currentTime,
    maxDuration,
    trackHeight = 48,
    className = '',
}) => {
    const safeMax = Math.max(maxDuration, 0.0001);
    const leftPct = Math.min(100, Math.max(0, (currentTime / safeMax) * 100));

    return (
        <div
            className={`absolute top-0 pointer-events-none ${className}`}
            style={{ left: `${leftPct}%`, height: `${trackHeight}px` }}
        >
            {/* 顶部时间标签（三角形箭头） */}
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                <div className="relative">
                    {/* 时间标签背景 */}
                    <div className="bg-red-500 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                        {formatTime(currentTime)}
                    </div>
                    {/* 小三角箭头 */}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent border-t-red-500" />
                </div>
            </div>

            {/* 竖线 */}
            <div
                className="w-[2px] h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                style={{ height: `${trackHeight}px` }}
            />

            {/* 底部圆点（可选） */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full shadow-lg" />
        </div>
    );
};
