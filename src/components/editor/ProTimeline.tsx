import React from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';
import { TimelineToolbar, TimelineToolMode } from './TimelineToolbar';
import { DraggablePlayhead } from './DraggablePlayhead';
import { TimelineClip } from './TimelineClip';
import { TimelineActions } from './TimelineActions';
import { useTimelineInteraction } from './useTimelineInteraction';
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
    onTrimSegment?: (start: number, end: number) => void;
    onSplitAt?: (time: number, index?: number) => void;
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
    onTrimSegment,
    onSplitAt,
    onDeleteSelected,
    onUndo,
    onPreviewEdited,
    onResetTrim,
    skimmingEnabled = true,
    className = '',
}) => {
    const { containerRef, zoomLevel, activeTool, setActiveTool, skimTime, setScrollLeft, displayDuration, collapsedSegments, sourceToSequence, sequenceToSource, handleZoomIn, handleZoomOut, handleZoomReset, timelineWidthPct, toPct, handleMouseMove, handleMouseLeave, handleTimelineClick, ticks } = useTimelineInteraction({ maxDuration, segments, totalSelectedDuration, skimmingEnabled, onSeek, onSplitAt });

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
            <div className="flex-shrink-0 px-3 py-1.5 border-b border-th-edge bg-th-surface">
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
                            <span className="text-indigo-600 dark:text-indigo-400 ml-1 font-semibold">{formatTime(totalSelectedDuration)}</span>
                        </span>
                    </div>

                    <TimelineActions {...{ currentTime, canSplit, canDelete, canUndo, onPreviewEdited, onSplitAt, onDeleteSelected, onUndo, onResetTrim }} />
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
                    <div className="relative flex-1 min-h-[48px] bg-th-deep">
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
                                    trimBounds={{ start: idx > 0 ? segments[idx - 1].end : 0, end: idx < segments.length - 1 ? segments[idx + 1].start : maxDuration }}
                                    onTrim={onTrimSegment}
                                    isBlade={activeTool === 'blade'}
                                    onBladeClick={(event) => {
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        if (rect.width <= 0) return;
                                        // The clip rectangle already includes zoom and scroll offsets.
                                        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                                        const segment = segments[idx];
                                        onSplitAt?.(segment.start + fraction * (segment.end - segment.start), idx);
                                    }}
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
                bg-th-surface
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
                        <kbd className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-700/60 rounded text-amber-700 dark:text-amber-200 border border-amber-300 dark:border-amber-500/50 shadow-sm">B</kbd>
                        <span className="text-th-tertiary">Blade</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-red-100 dark:bg-red-700/60 rounded text-red-700 dark:text-red-200 border border-red-300 dark:border-red-500/50 shadow-sm">Del</kbd>
                        <span className="text-th-tertiary">Delete</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-th-tertiary">
                        Segments: <span className="text-purple-600 dark:text-purple-400 font-semibold">{segments.length}</span>
                    </span>
                    <span className="text-th-tertiary">
                        Total: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{formatTime(displayDuration)}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};
