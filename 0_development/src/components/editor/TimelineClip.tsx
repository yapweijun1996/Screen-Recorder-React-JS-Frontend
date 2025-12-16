import React, { useMemo } from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';

interface TimelineClipProps {
    segment: TrimRange;
    index: number;
    isSelected: boolean;
    leftPct: number;
    widthPct: number;
    onSelect: () => void;
    maxDuration: number;
}

/**
 * 时间轴片段组件 - 高质感渲染
 * 包含精细波形模拟、渐变、阴影效果
 */
export const TimelineClip: React.FC<TimelineClipProps> = ({
    segment,
    index,
    isSelected,
    leftPct,
    widthPct,
    onSelect,
    maxDuration,
}) => {
    // 生成伪波形数据 - 使用确定性种子
    const waveformBars = useMemo(() => {
        const barCount = Math.max(8, Math.min(60, Math.floor(widthPct * 1.5)));
        const bars: number[] = [];

        // 使用片段属性作为伪随机种子
        const seed = segment.start * 1000 + segment.end * 100 + index;

        for (let i = 0; i < barCount; i++) {
            // 伪随机但确定性的高度计算
            const noise = Math.sin(seed + i * 0.7) * 0.5 + 0.5;
            const wave = Math.sin((i / barCount) * Math.PI * 2 + seed * 0.1) * 0.3;
            const height = 0.2 + noise * 0.6 + wave * 0.2;
            bars.push(Math.max(0.15, Math.min(0.95, height)));
        }

        return bars;
    }, [segment.start, segment.end, index, widthPct]);

    const duration = segment.end - segment.start;
    const durationLabel = formatTime(duration);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className={`
                absolute top-1 bottom-1 rounded-md
                transition-all duration-150 ease-out
                group overflow-hidden
                ${isSelected
                    ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-950 z-20 shadow-lg shadow-yellow-500/20'
                    : 'hover:ring-1 hover:ring-purple-400/50 z-10'
                }
            `}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={`#${index + 1}: ${formatTime(segment.start)} - ${formatTime(segment.end)} (${durationLabel})`}
        >
            {/* 背景渐变层 */}
            <div className={`
                absolute inset-0 rounded-md
                ${isSelected
                    ? 'bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800'
                    : 'bg-gradient-to-b from-purple-500/90 via-purple-600/90 to-purple-800/90'
                }
            `} />

            {/* 光泽效果 (Top highlight) */}
            <div className={`
                absolute inset-x-0 top-0 h-[40%] rounded-t-md
                bg-gradient-to-b from-white/20 to-transparent
                pointer-events-none
            `} />

            {/* 波形区域 */}
            <div className="absolute inset-0 flex items-center justify-center px-1 overflow-hidden">
                <div className="flex items-center justify-center gap-[1px] h-full w-full">
                    {waveformBars.map((height, i) => (
                        <div
                            key={i}
                            className={`
                                flex-shrink-0 rounded-full
                                transition-all duration-200
                                ${isSelected ? 'bg-white/50' : 'bg-white/30'}
                                group-hover:bg-white/40
                            `}
                            style={{
                                width: widthPct > 3 ? '2px' : '1px',
                                height: `${height * 70}%`,
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* 片段编号标签 */}
            {widthPct > 4 && (
                <div className={`
                    absolute bottom-1 left-1.5 
                    text-[9px] font-mono font-bold
                    px-1 py-0.5 rounded
                    ${isSelected
                        ? 'bg-yellow-400/90 text-slate-900'
                        : 'bg-black/40 text-white/90'
                    }
                    backdrop-blur-sm
                    shadow-sm
                `}>
                    #{index + 1}
                </div>
            )}

            {/* 时长标签 (仅当空间足够时显示) */}
            {widthPct > 8 && (
                <div className={`
                    absolute bottom-1 right-1.5
                    text-[8px] font-mono
                    px-1 py-0.5 rounded
                    bg-black/30 text-white/70
                    backdrop-blur-sm
                `}>
                    {durationLabel}
                </div>
            )}

            {/* Trim Handles - 仅选中时显示 */}
            {isSelected && (
                <>
                    {/* 左侧手柄 */}
                    <div className="
                        absolute left-0 top-0 bottom-0 w-2
                        bg-gradient-to-r from-yellow-400 to-yellow-400/50
                        rounded-l-md cursor-ew-resize
                        hover:from-yellow-300 hover:to-yellow-300/70
                        transition-all
                        flex items-center justify-center
                    ">
                        <div className="w-0.5 h-4 bg-yellow-900/30 rounded-full" />
                    </div>

                    {/* 右侧手柄 */}
                    <div className="
                        absolute right-0 top-0 bottom-0 w-2
                        bg-gradient-to-l from-yellow-400 to-yellow-400/50
                        rounded-r-md cursor-ew-resize
                        hover:from-yellow-300 hover:to-yellow-300/70
                        transition-all
                        flex items-center justify-center
                    ">
                        <div className="w-0.5 h-4 bg-yellow-900/30 rounded-full" />
                    </div>
                </>
            )}

            {/* 底部阴影 */}
            <div className="
                absolute inset-x-0 bottom-0 h-2
                bg-gradient-to-t from-black/30 to-transparent
                rounded-b-md pointer-events-none
            " />
        </button>
    );
};
