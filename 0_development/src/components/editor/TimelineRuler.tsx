import React, { useMemo } from 'react';

interface TimelineRulerProps {
    maxDuration: number;
    /** 时间轴可视宽度（像素），用于计算刻度密度 */
    viewportWidth?: number;
    className?: string;
}

/**
 * 专业视频编辑器风格的时间刻度尺
 * - 自动计算刻度间隔（1s, 5s, 10s, 30s, 1min, 5min）
 * - 主刻度显示时间标签，次刻度显示小竖线
 */
export const TimelineRuler: React.FC<TimelineRulerProps> = ({
    maxDuration,
    viewportWidth = 1000,
    className = '',
}) => {
    const { majorInterval, minorInterval, ticks } = useMemo(() => {
        const safeMax = Math.max(maxDuration, 1);
        
        // 根据视频总长度和视口宽度，智能选择刻度间隔
        const pixelsPerSecond = viewportWidth / safeMax;
        
        // 目标：主刻度之间至少 60px
        const targetMajorIntervalPx = 80;
        const targetMinorIntervalPx = 20;
        
        // 候选间隔（秒）
        const intervals = [1, 5, 10, 30, 60, 300, 600, 1800, 3600];
        
        let majorInterval = intervals.find((interval) => {
            return interval * pixelsPerSecond >= targetMajorIntervalPx;
        }) || 60;
        
        let minorInterval = intervals.find((interval) => {
            return interval * pixelsPerSecond >= targetMinorIntervalPx && interval < majorInterval;
        }) || majorInterval / 5;
        
        // 生成刻度点
        const ticks: Array<{ time: number; isMajor: boolean; label?: string }> = [];
        
        for (let t = 0; t <= safeMax; t += minorInterval) {
            const isMajor = Math.abs(t % majorInterval) < 0.001;
            ticks.push({
                time: t,
                isMajor,
                label: isMajor ? formatTimeLabel(t) : undefined,
            });
        }
        
        // 确保最后一个刻度存在
        if (ticks.length === 0 || ticks[ticks.length - 1].time < safeMax - 0.001) {
            ticks.push({ time: safeMax, isMajor: true, label: formatTimeLabel(safeMax) });
        }
        
        return { majorInterval, minorInterval, ticks };
    }, [maxDuration, viewportWidth]);
    
    const toPct = (time: number) => {
        const safeMax = Math.max(maxDuration, 0.0001);
        return Math.min(100, Math.max(0, (time / safeMax) * 100));
    };
    
    return (
        <div className={`relative h-8 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-700 ${className}`}>
            {/* 刻度线 */}
            {ticks.map((tick, idx) => {
                const leftPct = toPct(tick.time);
                return (
                    <div
                        key={`tick-${idx}-${tick.time}`}
                        className="absolute bottom-0"
                        style={{ left: `${leftPct}%` }}
                    >
                        {/* 竖线 */}
                        <div
                            className={`${
                                tick.isMajor
                                    ? 'w-[1px] h-3 bg-slate-500'
                                    : 'w-[1px] h-1.5 bg-slate-600'
                            }`}
                        />
                        {/* 时间标签（仅主刻度）*/}
                        {tick.label && (
                            <div className="absolute -top-0.5 left-1 text-[10px] font-mono text-slate-400 whitespace-nowrap select-none">
                                {tick.label}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/**
 * 格式化时间标签：00:05, 01:30 等
 */
function formatTimeLabel(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
