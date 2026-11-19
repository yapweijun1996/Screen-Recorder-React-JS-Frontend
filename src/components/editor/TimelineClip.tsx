import React from 'react';
import type { TrimRange } from '../../types';
import { formatTime } from '../../utils/format';
import { trimEdge, useClipTrim } from './useClipTrim';
import { useI18n } from '../../i18n';

interface TimelineClipProps {
    segment: TrimRange;
    index: number;
    isSelected: boolean;
    leftPct: number;
    widthPct: number;
    onSelect: () => void;
    maxDuration: number;
    trimBounds: TrimRange;
    onTrim?: (start: number, end: number) => void;
    isBlade?: boolean;
    showTrimHandles?: boolean;
    onBladeClick?: React.MouseEventHandler<HTMLButtonElement>;
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
    trimBounds,
    onTrim,
    isBlade = false,
    showTrimHandles = !isBlade,
    onBladeClick,
}) => {
    const { t } = useI18n();
    const { preview, handleProps } = useClipTrim({ segment, bounds: trimBounds, displayDuration: maxDuration, onTrim });
    const displayed = preview ?? segment;
    const previewLeft = leftPct + ((displayed.start - segment.start) / maxDuration) * 100;
    const previewWidth = preview ? ((displayed.end - displayed.start) / maxDuration) * 100 : widthPct;
    const duration = displayed.end - displayed.start;
    const durationLabel = formatTime(duration);
    const keyboardTrim = isSelected && showTrimHandles && !!onTrim;

    return (
        <button
            type="button"
            data-timeline-clip
            aria-pressed={isSelected}
            aria-keyshortcuts={keyboardTrim ? 'Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight' : undefined}
            aria-describedby={keyboardTrim ? `clip-trim-keys-${index}` : undefined}
            onKeyDown={event => {
                if (!keyboardTrim || !event.altKey || event.ctrlKey || event.metaKey) return;
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const result = trimEdge(segment, trimBounds, event.shiftKey ? 'end' : 'start', (event.key === 'ArrowLeft' ? -1 : 1) / 30);
                if (result.start !== segment.start || result.end !== segment.end) onTrim?.(result.start, result.end);
            }}
            onClick={(e) => {
                e.stopPropagation();
                if (isBlade) {
                    // Keyboard activation has no pointer position to cut at.
                    if (e.detail > 0) onBladeClick?.(e);
                } else onSelect();
            }}
            className={`
                absolute top-1 bottom-1 rounded-md
                transition-all duration-150 ease-out
                group overflow-hidden
                ${isBlade ? 'cursor-crosshair' : ''}
                ${isSelected
                    ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-th-deep z-20 shadow-lg shadow-yellow-500/20'
                    : 'hover:ring-1 hover:ring-purple-400/50 z-10'
                }
            `}
            style={{ left: `${previewLeft}%`, width: `${previewWidth}%`, transition: preview ? 'none' : undefined }}
            title={`#${index + 1}: ${formatTime(segment.start)} - ${formatTime(segment.end)} (${durationLabel})`}
        >
            {keyboardTrim && <span hidden id={`clip-trim-keys-${index}`}>{t('editor.trim.keyboardHint')}</span>}
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

            {/* 片段编号标签 */}
            {widthPct > 4 && (
                <div className={`
                    absolute bottom-1 left-1.5 
                    text-[9px] font-mono font-bold
                    px-1 py-0.5 rounded
                    ${isSelected
                        ? 'bg-yellow-400/90 text-th-base'
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
            {isSelected && showTrimHandles && (
                <>
                    {/* 左侧手柄 */}
                    <div {...handleProps('start')} className="
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
                    <div {...handleProps('end')} className="
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
