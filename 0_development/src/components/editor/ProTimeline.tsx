import React, { useRef, useState, useCallback, useMemo } from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';
import { TimelineToolbar, TimelineToolMode } from './TimelineToolbar';
import { DraggablePlayhead } from './DraggablePlayhead';
import { TimelineClip } from './TimelineClip';
import { Play, Scissors, Trash2, Undo2, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';

interface ProTimelineProps {
    maxDuration: number;
    segments: TrimRange[];
    selectedIndex: number;
    currentTime: number;
    totalSelectedDuration: number;
    canUndo: boolean;
    canDelete: boolean;
    onSelectSegment: (index: number) => void;
    onSeek: (time: number) => void;
    onSplitAt?: (time: number) => void;
    onDeleteSelected?: () => void;
    onUndo?: () => void;
    onPreviewEdited?: () => void;
    onResetTrim?: () => void;
    skimmingEnabled?: boolean;
    className?: string;
}

/**
 * Final Cut Pro 风格的专业时间轴
 * - 可缩放
 * - 悬停预览 (Skimming)
 * - 工具栏
 * - 可拖拽播放头
 */
export const ProTimeline: React.FC<ProTimelineProps> = ({
    maxDuration,
    segments,
    selectedIndex,
    currentTime,
    totalSelectedDuration,
    canUndo,
    canDelete,
    onSelectSegment,
    onSeek,
    onSplitAt,
    onDeleteSelected,
    onUndo,
    onPreviewEdited,
    onResetTrim,
    skimmingEnabled = true,
    className = '',
}) => {
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

    // 缩放控制
    const handleZoomIn = useCallback(() => {
        setZoomLevel((prev) => Math.min(prev * 1.5, 10));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoomLevel((prev) => Math.max(prev / 1.5, 0.5));
    }, []);

    const handleZoomReset = useCallback(() => {
        setZoomLevel(1);
    }, []);

    // 计算时间轴总宽度（基于缩放）
    const timelineWidthPct = useMemo(() => {
        return 100 * zoomLevel;
    }, [zoomLevel]);

    const toPct = useCallback((time: number) => {
        return Math.min(100, Math.max(0, (time / displayDuration) * 100));
    }, [displayDuration]);

    // 悬停预览 (Skimming)
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

    // 点击处理
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
            // 剪刀工具：在点击位置剪切
            onSplitAt?.(sourceTime);
        } else {
            // 选择工具：跳转到点击位置
            onSeek(sourceTime);
        }
    }, [activeTool, displayDuration, sequenceToSource, onSeek, onSplitAt]);

    // 生成刻度
    const ticks = useMemo(() => {
        const result: Array<{ time: number; isMajor: boolean; label?: string }> = [];

        // 根据缩放级别调整刻度密度
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

    // 光标样式
    const cursorClass = activeTool === 'blade'
        ? 'cursor-crosshair'
        : activeTool === 'hand'
            ? 'cursor-grab'
            : 'cursor-pointer';
    const { t } = useI18n();

    // 判断是否可以分割
    const canSplit = currentTime > (segments[selectedIndex]?.start || 0) + 0.5
        && currentTime < (segments[selectedIndex]?.end || maxDuration) - 0.5;

    return (
        <div ref={containerRef} className={`bg-th-deep h-full flex flex-col overflow-hidden ${className}`}>
            {/* 工具栏 - 包含工具选择和操作按钮 */}
            <div className="flex-shrink-0 px-3 py-1.5 border-b border-th-edge bg-gradient-to-b from-th-base to-th-deep">
                <div className="flex items-center justify-between gap-2">
                    {/* 左侧：工具选择 + 缩放 */}
                    <TimelineToolbar
                        activeTool={activeTool}
                        onToolChange={setActiveTool}
                        zoomLevel={zoomLevel}
                        onZoomIn={handleZoomIn}
                        onZoomOut={handleZoomOut}
                        onZoomReset={handleZoomReset}
                    />

                    {/* 中间：时间统计 - 隐藏在小屏 */}
                    <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-th-tertiary">
                        <span>
                            {t('editor.trim.totalSelected')}:
                            <span className="text-indigo-400 ml-1 font-semibold">{formatTime(totalSelectedDuration)}</span>
                        </span>
                    </div>

                    {/* 右侧：操作按钮 - 响应式布局 */}
                    <div className="flex items-center gap-0.5 sm:gap-1">
                        {/* 预览按钮 */}
                        <button
                            type="button"
                            onClick={onPreviewEdited}
                            className="
                                group relative flex items-center gap-1 
                                px-1.5 sm:px-2 py-1 text-[10px] rounded-md 
                                bg-th-card/50 text-th-secondary
                                hover:bg-th-input hover:text-white
                                transition-all border border-th-divider
                            "
                            title={t('editor.trim.preview')}
                        >
                            <Play size={12} />
                            <span className="hidden md:inline">{t('editor.trim.preview')}</span>
                        </button>

                        {/* 分割按钮 - 增加提示 */}
                        <div className="relative group">
                            <button
                                type="button"
                                onClick={() => onSplitAt?.(currentTime)}
                                disabled={!canSplit}
                                className="
                                    flex items-center gap-1 
                                    px-1.5 sm:px-2 py-1 text-[10px] rounded-md 
                                    bg-amber-600/20 text-amber-300 
                                    hover:bg-amber-600/40 
                                    transition-all border border-amber-600/30 
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                "
                                title={`${t('editor.trim.splitAtPlayhead')} (B)`}
                            >
                                <Scissors size={12} />
                                <span className="hidden md:inline">Split</span>
                            </button>
                            {/* 最小分割提示 */}
                            {!canSplit && (
                                <div className="
                                    hidden group-hover:block
                                    absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50
                                    bg-th-surface/95 backdrop-blur-md
                                    text-[9px] text-amber-300
                                    px-2 py-1 rounded
                                    border border-amber-600/30
                                    whitespace-nowrap
                                    shadow-lg
                                ">
                                    需要距离片段两端至少 0.5s
                                </div>
                            )}
                        </div>

                        {/* 删除按钮 */}
                        <button
                            type="button"
                            onClick={onDeleteSelected}
                            disabled={!canDelete}
                            className="
                                flex items-center gap-1 
                                px-1.5 sm:px-2 py-1 text-[10px] rounded-md 
                                bg-red-600/20 text-red-300 
                                hover:bg-red-600/40 
                                transition-all border border-red-600/30 
                                disabled:opacity-40 disabled:cursor-not-allowed
                            "
                            title={`${t('editor.trim.deleteSegment')} (Del)`}
                        >
                            <Trash2 size={12} />
                            <span className="hidden md:inline">Delete</span>
                        </button>

                        {/* 分隔线 - 大屏显示 */}
                        <div className="hidden sm:block w-px h-4 bg-th-divider/50 mx-0.5" />

                        {/* 撤销按钮 */}
                        <button
                            type="button"
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="
                                p-1.5 rounded-md 
                                text-th-secondary hover:text-white hover:bg-th-input
                                transition-all border border-th-divider/50
                                disabled:opacity-40 disabled:cursor-not-allowed
                            "
                            title={`${t('editor.trim.undo')} (⌘Z)`}
                        >
                            <Undo2 size={12} />
                        </button>

                        {/* 重置按钮 */}
                        <button
                            type="button"
                            onClick={onResetTrim}
                            className="
                                p-1.5 rounded-md 
                                text-th-secondary hover:text-white hover:bg-th-input
                                transition-all border border-th-divider/50
                            "
                            title={t('editor.trim.reset')}
                        >
                            <RotateCcw size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 可滚动的时间轴区域 */}
            <div
                className={`timeline-scrollable flex-1 min-h-0 overflow-x-auto overflow-y-hidden ${cursorClass}`}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            >
                <div
                    className="relative h-full min-h-[70px] flex flex-col"
                    style={{ width: `${timelineWidthPct}%`, minWidth: '100%' }}
                    onClick={handleTimelineClick}
                >
                    {/* 时间刻度尺 - 紧凑 */}
                    <div className="flex-shrink-0 h-5 bg-th-base border-b border-th-edge relative">
                        {ticks.map((tick, idx) => {
                            const leftPct = toPct(tick.time);
                            return (
                                <div
                                    key={`tick-${idx}`}
                                    className="absolute bottom-0"
                                    style={{ left: `${leftPct}%` }}
                                >
                                    <div className={tick.isMajor ? 'w-[1px] h-3 bg-th-tertiary' : 'w-[1px] h-1.5 bg-th-faint'} />
                                    {tick.label && (
                                        <div className="absolute -top-0.5 left-1 text-[9px] font-mono text-th-tertiary whitespace-nowrap select-none">
                                            {tick.label}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 轨道区域 - 填满剩余高度 */}
                    <div className="relative flex-1 min-h-[48px] bg-gradient-to-b from-th-deep to-th-base/50">
                        {/* 轨道背景网格 */}
                        <div
                            className="absolute inset-0 opacity-10"
                            style={{
                                backgroundImage: `
                                    linear-gradient(to right, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px)
                                `,
                                backgroundSize: '20px 10px',
                            }}
                        />

                        {/* 片段（Clips）- 使用折叠位置（涟漪模式） */}
                        {collapsedSegments.map((cseg, idx) => {
                            const leftPct = toPct(cseg.displayStart);
                            const widthPct = Math.max(0.5, toPct(cseg.displayEnd) - leftPct);
                            const isSelected = idx === selectedIndex;

                            return (
                                <TimelineClip
                                    key={`segment-${idx}`}
                                    segment={segments[idx]}
                                    index={idx}
                                    isSelected={isSelected}
                                    leftPct={leftPct}
                                    widthPct={widthPct}
                                    onSelect={() => onSelectSegment(idx)}
                                    maxDuration={displayDuration}
                                />
                            );
                        })}

                        {/* 播放头 (sequence time) */}
                        <DraggablePlayhead
                            currentTime={sourceToSequence(currentTime)}
                            maxDuration={displayDuration}
                            containerRef={containerRef as React.RefObject<HTMLElement>}
                            onSeek={(seqTime) => onSeek(sequenceToSource(seqTime))}
                            trackHeight={70}
                        />

                        {/* Skimming 指示器 - 增强效果 */}
                        {skimTime !== null && skimTime !== currentTime && (
                            <div
                                className="absolute top-0 bottom-0 pointer-events-none z-20"
                                style={{ left: `${toPct(skimTime)}%` }}
                            >
                                {/* 垂直线 + 光晕 */}
                                <div className="w-[1px] h-full bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                                {/* 时间标签 */}
                                <div className="
                                    absolute -top-6 left-1/2 -translate-x-1/2 
                                    bg-cyan-900/90 text-cyan-200 text-[9px] font-mono font-medium
                                    px-1.5 py-0.5 rounded-sm
                                    border border-cyan-500/50
                                    shadow-lg shadow-cyan-500/20
                                    backdrop-blur-sm
                                ">
                                    {formatTime(skimTime)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 底部信息栏 - 键盘快捷键提示 */}
            <div className="
                flex-shrink-0 px-3 py-2
                border-t border-th-divider/50
                bg-gradient-to-r from-th-base/80 via-th-card/50 to-th-base/80
                backdrop-blur-sm
                flex items-center justify-between
                text-[10px] font-mono text-th-secondary
            ">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-th-input/80 rounded text-th-secondary border border-th-divider/50 shadow-sm">Space</kbd>
                        <span className="text-th-tertiary">Play</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-th-input/80 rounded text-th-secondary border border-th-divider/50 shadow-sm">J</kbd>
                        <kbd className="px-1 py-0.5 bg-th-input/80 rounded text-th-secondary border border-th-divider/50 shadow-sm">K</kbd>
                        <kbd className="px-1 py-0.5 bg-th-input/80 rounded text-th-secondary border border-th-divider/50 shadow-sm">L</kbd>
                        <span className="text-th-tertiary">Shuttle</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-amber-700/60 rounded text-amber-200 border border-amber-500/50 shadow-sm">B</kbd>
                        <span className="text-th-tertiary">Blade</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-red-700/60 rounded text-red-200 border border-red-500/50 shadow-sm">Del</kbd>
                        <span className="text-th-tertiary">Delete</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-th-tertiary">
                        Segments: <span className="text-purple-400 font-semibold">{segments.length}</span>
                    </span>
                    <span className="text-th-tertiary">
                        Total: <span className="text-indigo-400 font-semibold">{formatTime(displayDuration)}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

