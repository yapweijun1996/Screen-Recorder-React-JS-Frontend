import React from 'react';
import type { TrimRange } from '../../types';
import { useI18n } from '../../i18n';

interface SegmentsTimelineProps {
    maxDuration: number;
    segments: TrimRange[];
    selectedIndex: number;
    currentTime: number;
    mode: 'keep' | 'remove';
    removeRange?: { start: number; end: number };
    onSeek?: (time: number) => void;
    className?: string;
}

/**
 * 視覺化時間軸：
 * - 紫色：保留片段
 * - 深色：已刪除/不保留
 * - 紅色：目前「刪除區間」選擇（remove 模式）
 * - 白線：播放頭位置
 */
export const SegmentsTimeline: React.FC<SegmentsTimelineProps> = ({
    maxDuration,
    segments,
    selectedIndex,
    currentTime,
    mode,
    removeRange,
    onSeek,
    className = '',
}) => {
    const { t } = useI18n();
    const safeMax = Math.max(maxDuration, 0.0001);

    const toPct = (time: number) => {
        const p = (time / safeMax) * 100;
        return Math.min(100, Math.max(0, p));
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/80 border border-purple-300/30" />
                        {t('editor.trim.legend.keep')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 border border-slate-600" />
                        {t('editor.trim.legend.deleted')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-white/80" />
                        {t('editor.trim.legend.playhead')}
                    </span>
                </div>
                {mode === 'remove' && (
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-500/80 border border-red-300/30" />
                        {t('editor.trim.legend.remove')}
                    </span>
                )}
            </div>

            <div
                className="relative h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700 cursor-pointer"
                onPointerDown={(e) => {
                    if (!onSeek) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const p01 = (e.clientX - rect.left) / rect.width;
                    const clamped = Math.min(1, Math.max(0, p01));
                    onSeek(clamped * safeMax);
                }}
                title={t('editor.player.seekHint')}
            >
                {/* kept segments */}
                {segments.map((seg, idx) => {
                    const left = toPct(seg.start);
                    const right = toPct(seg.end);
                    const width = Math.max(0, right - left);
                    const isSelected = idx === selectedIndex;

                    return (
                        <div
                            key={`${seg.start}-${seg.end}-${idx}`}
                            className={`absolute top-0 bottom-0 ${isSelected ? 'bg-purple-500/90' : 'bg-purple-500/70'} ${isSelected ? 'ring-1 ring-purple-200/60' : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                        />
                    );
                })}

                {/* remove selection overlay */}
                {mode === 'remove' && removeRange && (
                    <div
                        className="absolute top-0 bottom-0 bg-red-500/35 border-x border-red-300/40"
                        style={{
                            left: `${toPct(Math.min(removeRange.start, removeRange.end))}%`,
                            width: `${Math.max(0, toPct(Math.max(removeRange.start, removeRange.end)) - toPct(Math.min(removeRange.start, removeRange.end)))}%`,
                        }}
                    />
                )}

                {/* playhead */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.25)]"
                    style={{ left: `calc(${toPct(currentTime)}% - 1px)` }}
                />
            </div>
        </div>
    );
};

