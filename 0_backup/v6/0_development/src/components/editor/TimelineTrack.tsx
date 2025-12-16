import React from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';

interface TimelineTrackProps {
    maxDuration: number;
    segments: TrimRange[];
    selectedIndex: number;
    onSelectSegment: (index: number) => void;
    className?: string;
}

/**
 * 专业视频编辑器风格的轨道视图
 * - 以"块状"（Block）形式显示片段
 * - 突出显示选中片段
 * - 显示被删除的"空隙"（Gap）
 */
export const TimelineTrack: React.FC<TimelineTrackProps> = ({
    maxDuration,
    segments,
    selectedIndex,
    onSelectSegment,
    className = '',
}) => {
    const safeMax = Math.max(maxDuration, 0.0001);
    const toPct = (time: number) => Math.min(100, Math.max(0, (time / safeMax) * 100));

    return (
        <div className={`relative h-12 bg-slate-950 border-b border-slate-800 ${className}`}>
            {/* 背景网格线（可选） */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="h-full" style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4%, rgba(100, 116, 139, 0.1) 4%, rgba(100, 116, 139, 0.1) 4.5%)',
                }} />
            </div>

            {/* 片段块（Clips） */}
            {segments.map((seg, idx) => {
                const leftPct = toPct(seg.start);
                const widthPct = Math.max(0.5, toPct(seg.end) - leftPct);
                const isSelected = idx === selectedIndex;

                return (
                    <button
                        key={`segment-${idx}-${seg.start}`}
                        type="button"
                        onClick={() => onSelectSegment(idx)}
                        className={`
                            absolute top-1 bottom-1 rounded-md overflow-hidden
                            transition-all duration-150 cursor-pointer
                            ${isSelected
                                ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-slate-950 shadow-lg shadow-indigo-500/30 z-10'
                                : 'hover:ring-1 hover:ring-purple-400/50'
                            }
                        `}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`#${idx + 1}: ${formatTime(seg.start)} - ${formatTime(seg.end)}`}
                    >
                        {/* 片段背景（渐变） */}
                        <div className={`
                            h-full transition-all
                            ${isSelected
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600'
                                : 'bg-gradient-to-r from-purple-700/80 to-purple-600/80 hover:from-purple-600 hover:to-purple-500'
                            }
                        `}>
                            {/* 片段内部装饰：条纹纹理 */}
                            <div className="h-full opacity-10" style={{
                                backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
                            }} />

                            {/* 片段标签（仅当宽度足够时显示） */}
                            {widthPct > 8 && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[10px] font-mono text-white/90 font-semibold select-none pointer-events-none">
                                        #{idx + 1}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 左右拖拽手柄（Trim Handles） - 仅选中时显示 */}
                        {isSelected && (
                            <>
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/40 hover:bg-white/70 cursor-ew-resize" />
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/40 hover:bg-white/70 cursor-ew-resize" />
                            </>
                        )}
                    </button>
                );
            })}

            {/* 空隙（Gaps）- 显示已删除的区间 */}
            {segments.length > 0 && renderGaps(segments, maxDuration, toPct)}
        </div>
    );
};

/**
 * 渲染片段之间的空隙（Gap），用斜线纹理表示已删除区域
 */
function renderGaps(
    segments: TrimRange[],
    maxDuration: number,
    toPct: (time: number) => number
): React.ReactNode {
    const gaps: React.ReactNode[] = [];

    // 开头的空隙（如果第一个片段不是从 0 开始）
    if (segments[0].start > 0.01) {
        gaps.push(
            <div
                key="gap-start"
                className="absolute top-0 bottom-0 bg-slate-800/50 border-x border-slate-700"
                style={{
                    left: 0,
                    width: `${toPct(segments[0].start)}%`,
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(148, 163, 184, 0.1) 3px, rgba(148, 163, 184, 0.1) 6px)',
                }}
            />
        );
    }

    // 中间的空隙
    for (let i = 0; i < segments.length - 1; i++) {
        const gapStart = segments[i].end;
        const gapEnd = segments[i + 1].start;
        const gapWidth = toPct(gapEnd) - toPct(gapStart);

        if (gapWidth > 0.1) {
            gaps.push(
                <div
                    key={`gap-${i}`}
                    className="absolute top-0 bottom-0 bg-slate-800/50 border-x border-slate-700"
                    style={{
                        left: `${toPct(gapStart)}%`,
                        width: `${gapWidth}%`,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(148, 163, 184, 0.1) 3px, rgba(148, 163, 184, 0.1) 6px)',
                    }}
                />
            );
        }
    }

    // 结尾的空隙（如果最后一个片段不到视频末尾）
    const lastSeg = segments[segments.length - 1];
    if (lastSeg.end < maxDuration - 0.01) {
        gaps.push(
            <div
                key="gap-end"
                className="absolute top-0 bottom-0 bg-slate-800/50 border-x border-slate-700"
                style={{
                    left: `${toPct(lastSeg.end)}%`,
                    width: `${100 - toPct(lastSeg.end)}%`,
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(148, 163, 184, 0.1) 3px, rgba(148, 163, 184, 0.1) 6px)',
                }}
            />
        );
    }

    return gaps;
}
