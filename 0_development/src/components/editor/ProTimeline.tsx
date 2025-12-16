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
        return Math.min(100, Math.max(0, (time / safeMax) * 100));
    }, [safeMax]);

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
        const time = timePct * safeMax;

        setSkimTime(Math.max(0, Math.min(safeMax, time)));
    }, [skimmingEnabled, activeTool, safeMax]);

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
        const time = Math.max(0, Math.min(safeMax, timePct * safeMax));

        if (activeTool === 'blade') {
            // 剪刀工具：在点击位置剪切
            onSplitAt?.(time);
        } else {
            // 选择工具：跳转到点击位置
            onSeek(time);
        }
    }, [activeTool, safeMax, onSeek, onSplitAt]);

    // 生成刻度
    const ticks = useMemo(() => {
        const result: Array<{ time: number; isMajor: boolean; label?: string }> = [];

        // 根据缩放级别调整刻度密度
        const baseInterval = zoomLevel >= 3 ? 1 : zoomLevel >= 1.5 ? 5 : 10;
        const majorInterval = baseInterval * 5;

        for (let t = 0; t <= safeMax; t += baseInterval) {
            const isMajor = t % majorInterval < 0.001;
            result.push({
                time: t,
                isMajor,
                label: isMajor ? formatTime(t) : undefined,
            });
        }

        return result;
    }, [safeMax, zoomLevel]);

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
        <div ref={containerRef} className={`bg-slate-950 rounded-lg border border-slate-800 overflow-hidden ${className}`}>
            {/* 工具栏 - 包含工具选择和操作按钮 */}
            <div className="px-3 py-1.5 border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
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
                    <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-slate-500">
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
                                bg-slate-800/50 text-slate-300 
                                hover:bg-slate-700 hover:text-white 
                                transition-all border border-slate-700
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
                                    bg-slate-900/95 backdrop-blur-md
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
                        <div className="hidden sm:block w-px h-4 bg-slate-700/50 mx-0.5" />

                        {/* 撤销按钮 */}
                        <button
                            type="button"
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="
                                p-1.5 rounded-md 
                                text-slate-400 hover:text-white hover:bg-slate-700 
                                transition-all border border-slate-700/50
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
                                text-slate-400 hover:text-white hover:bg-slate-700 
                                transition-all border border-slate-700/50
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
                className={`timeline-scrollable overflow-x-auto overflow-y-hidden ${cursorClass}`}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            >
                <div
                    className="relative min-h-[70px]"
                    style={{ width: `${timelineWidthPct}%`, minWidth: '100%' }}
                    onClick={handleTimelineClick}
                >
                    {/* 时间刻度尺 - 紧凑 */}
                    <div className="h-5 bg-slate-900 border-b border-slate-800 relative">
                        {ticks.map((tick, idx) => {
                            const leftPct = toPct(tick.time);
                            return (
                                <div
                                    key={`tick-${idx}`}
                                    className="absolute bottom-0"
                                    style={{ left: `${leftPct}%` }}
                                >
                                    <div className={tick.isMajor ? 'w-[1px] h-3 bg-slate-500' : 'w-[1px] h-1.5 bg-slate-700'} />
                                    {tick.label && (
                                        <div className="absolute -top-0.5 left-1 text-[9px] font-mono text-slate-500 whitespace-nowrap select-none">
                                            {tick.label}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 轨道区域 - 增加高度以展示更精细的波形 */}
                    <div className="relative h-14 bg-gradient-to-b from-slate-950 to-slate-900/50">
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

                        {/* 空隙（Gaps）*/}
                        {renderGaps(segments, safeMax, toPct)}

                        {/* 片段（Clips）- 使用新的 TimelineClip 组件 */}
                        {segments.map((seg, idx) => {
                            const leftPct = toPct(seg.start);
                            const widthPct = Math.max(0.5, toPct(seg.end) - leftPct);
                            const isSelected = idx === selectedIndex;

                            return (
                                <TimelineClip
                                    key={`segment-${idx}`}
                                    segment={seg}
                                    index={idx}
                                    isSelected={isSelected}
                                    leftPct={leftPct}
                                    widthPct={widthPct}
                                    onSelect={() => onSelectSegment(idx)}
                                    maxDuration={safeMax}
                                />
                            );
                        })}

                        {/* 播放头 */}
                        <DraggablePlayhead
                            currentTime={currentTime}
                            maxDuration={safeMax}
                            containerRef={containerRef as React.RefObject<HTMLElement>}
                            onSeek={onSeek}
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
                px-3 py-2 
                border-t border-slate-700/50 
                bg-gradient-to-r from-slate-900/80 via-slate-800/50 to-slate-900/80
                backdrop-blur-sm
                flex items-center justify-between 
                text-[10px] font-mono text-slate-400
            ">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-700/80 rounded text-slate-300 border border-slate-600/50 shadow-sm">Space</kbd>
                        <span className="text-slate-500">Play</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-slate-700/80 rounded text-slate-300 border border-slate-600/50 shadow-sm">J</kbd>
                        <kbd className="px-1 py-0.5 bg-slate-700/80 rounded text-slate-300 border border-slate-600/50 shadow-sm">K</kbd>
                        <kbd className="px-1 py-0.5 bg-slate-700/80 rounded text-slate-300 border border-slate-600/50 shadow-sm">L</kbd>
                        <span className="text-slate-500">Shuttle</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-amber-700/60 rounded text-amber-200 border border-amber-500/50 shadow-sm">B</kbd>
                        <span className="text-slate-500">Blade</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-red-700/60 rounded text-red-200 border border-red-500/50 shadow-sm">Del</kbd>
                        <span className="text-slate-500">Delete</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-slate-500">
                        Segments: <span className="text-purple-400 font-semibold">{segments.length}</span>
                    </span>
                    <span className="text-slate-500">
                        Total: <span className="text-indigo-400 font-semibold">{formatTime(safeMax)}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

/**
 * 渲染空隙 (Gaps)
 */
function renderGaps(segments: TrimRange[], maxDuration: number, toPct: (t: number) => number): React.ReactNode {
    const gaps: React.ReactNode[] = [];

    // 开头空隙
    if (segments.length > 0 && segments[0].start > 0.01) {
        const widthPct = toPct(segments[0].start);
        gaps.push(
            <div
                key="gap-start"
                className="absolute top-0 bottom-0 bg-slate-900/80"
                style={{
                    left: 0,
                    width: `${widthPct}%`,
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.1) 4px, rgba(100,116,139,0.1) 8px)',
                }}
            />
        );
    }

    // 中间空隙
    for (let i = 0; i < segments.length - 1; i++) {
        const gapStart = segments[i].end;
        const gapEnd = segments[i + 1].start;
        if (gapEnd - gapStart > 0.01) {
            gaps.push(
                <div
                    key={`gap-${i}`}
                    className="absolute top-0 bottom-0 bg-slate-900/80"
                    style={{
                        left: `${toPct(gapStart)}%`,
                        width: `${toPct(gapEnd) - toPct(gapStart)}%`,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.1) 4px, rgba(100,116,139,0.1) 8px)',
                    }}
                />
            );
        }
    }

    // 结尾空隙
    if (segments.length > 0) {
        const lastEnd = segments[segments.length - 1].end;
        if (lastEnd < maxDuration - 0.01) {
            gaps.push(
                <div
                    key="gap-end"
                    className="absolute top-0 bottom-0 bg-slate-900/80"
                    style={{
                        left: `${toPct(lastEnd)}%`,
                        width: `${100 - toPct(lastEnd)}%`,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(100,116,139,0.1) 4px, rgba(100,116,139,0.1) 8px)',
                    }}
                />
            );
        }
    }

    return gaps;
}
