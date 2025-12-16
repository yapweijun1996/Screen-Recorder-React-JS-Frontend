import React, { useEffect, useMemo, useState, useRef } from 'react';
import { RangeSlider } from '../RangeSlider';
import { Button } from '../Button';
import { Play, Scissors, Trash2, Undo2, Hand, MousePointer2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { formatTime } from '../../utils/format';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { Playhead } from './Playhead';

interface EditorTrimPanelProps {
    playbackError: string | null;

    maxDuration: number;
    segments: Array<{ start: number; end: number }>;
    selectedIndex: number;
    currentTime: number;

    start: number;
    end: number;

    startLabel: string;
    endLabel: string;
    totalSelectedLabel: string;
    canUndo: boolean;

    onChange: (start: number, end: number) => void;
    onPreviewRequest: (time: number) => void;

    onSelectIndex: (index: number) => void;

    onPreviewEdited: () => void;
    onSplitAtPlayhead: () => void;
    onDeleteSelected: () => void;
    onRemoveRange: (start: number, end: number) => void;
    onUndo: () => void;
    onResetTrim: () => void;
}

export const EditorTrimPanel: React.FC<EditorTrimPanelProps> = ({
    playbackError,
    maxDuration,
    segments,
    selectedIndex,
    currentTime,
    start,
    end,
    startLabel,
    endLabel,
    totalSelectedLabel,
    canUndo,
    onChange,
    onPreviewRequest,
    onSelectIndex,
    onPreviewEdited,
    onSplitAtPlayhead,
    onDeleteSelected,
    onRemoveRange,
    onUndo,
    onResetTrim,
}) => {
    const { t } = useI18n();
    const MIN_SPLIT_GAP_SECONDS = 0.5;
    const canSplit = !playbackError && currentTime > start + MIN_SPLIT_GAP_SECONDS && currentTime < end - MIN_SPLIT_GAP_SECONDS;
    const canDelete = !playbackError && segments.length > 1;

    const [mode, setMode] = useState<'keep' | 'remove'>('remove');
    const [removeRange, setRemoveRange] = useState<{ start: number; end: number }>({ start: 0, end: Math.min(maxDuration, maxDuration * 0.1) });

    // 進入「刪除區間」模式時，預設用「播放頭附近」當選擇範圍，減少第一步操作成本
    useEffect(() => {
        if (mode !== 'remove') return;
        if (!Number.isFinite(maxDuration) || maxDuration <= 0) return;
        // 若播放頭剛好落在「已刪除區間」，使用者會覺得「按刪除沒反應」：
        // 因為那段本來就不在保留片段內。這裡自動把預設區間對齊到最近的保留片段，降低迷惑感。
        const active = segments.find((seg) => currentTime >= seg.start && currentTime <= seg.end);
        const fallback = segments[Math.min(selectedIndex, segments.length - 1)];
        const anchor = active
            ? currentTime
            : fallback
                ? (fallback.start + fallback.end) / 2
                : Math.min(currentTime, maxDuration);

        const span = Math.max(maxDuration * 0.05, MIN_SPLIT_GAP_SECONDS);
        const s = Math.max(0, anchor - span);
        const e = Math.min(maxDuration, anchor + span);
        setRemoveRange({ start: s, end: Math.max(e, s + MIN_SPLIT_GAP_SECONDS) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const removeSelectedDuration = useMemo(() => Math.max(removeRange.end - removeRange.start, 0), [removeRange]);
    const removeIntersectsKept = useMemo(() => {
        const s = Math.min(removeRange.start, removeRange.end);
        const e = Math.max(removeRange.start, removeRange.end);
        return segments.some((seg) => e > seg.start && s < seg.end);
    }, [removeRange, segments]);
    const canRemoveRange = !playbackError && removeSelectedDuration >= 0.1 && removeIntersectsKept;

    return (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            {/* 顶部工具栏 - 紧凑布局 */}
            <div className="px-3 py-2 bg-gradient-to-b from-slate-900 to-slate-900/80 border-b border-slate-800">
                <div className="flex items-center justify-between gap-2">
                    {/* 左侧：标题 + 统计 */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <Scissors size={16} className="text-indigo-400" />
                            <h3 className="font-semibold text-sm text-slate-200">{t('editor.trim.title')}</h3>
                        </div>
                        <div className="text-xs text-slate-500 font-mono bg-slate-950/50 px-2 py-0.5 rounded border border-slate-800">
                            {t('editor.trim.totalSelected')}: <span className="text-indigo-300 font-semibold">{totalSelectedLabel}</span>
                        </div>
                    </div>

                    {/* 右侧：模式切换 + 撤销 */}
                    <div className="flex items-center gap-2">
                        {/* 模式切换 */}
                        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-0.5">
                            <button
                                type="button"
                                className={`px-2.5 py-1 text-xs rounded-md transition-all ${mode === 'keep'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                                onClick={() => setMode('keep')}
                                disabled={!!playbackError}
                            >
                                <MousePointer2 size={12} className="inline mr-1" />
                                {t('editor.trim.mode.keep')}
                            </button>
                            <button
                                type="button"
                                className={`px-2.5 py-1 text-xs rounded-md transition-all ${mode === 'remove'
                                    ? 'bg-red-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                                onClick={() => setMode('remove')}
                                disabled={!!playbackError}
                            >
                                <Scissors size={12} className="inline mr-1" />
                                {t('editor.trim.mode.remove')}
                            </button>
                        </div>

                        {/* 撤销按钮 */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 py-1"
                            disabled={!canUndo}
                            onClick={onUndo}
                            title={t('editor.trim.undo')}
                        >
                            <Undo2 size={14} />
                        </Button>
                    </div>
                </div>

                {/* 提示文本 */}
                <div className={`mt-2 text-[11px] px-2 py-1.5 rounded-md ${mode === 'remove' && !removeIntersectsKept
                    ? 'text-amber-200 bg-amber-500/10 border border-amber-500/20'
                    : 'text-slate-500 bg-slate-950/30'
                    }`}>
                    {mode === 'remove'
                        ? (removeIntersectsKept ? t('editor.trim.removeHint') : t('editor.trim.removeNoOverlap'))
                        : t('editor.trim.keepHint')}
                </div>
            </div>

            {/* 片段列表（可选 - 可折叠或隐藏以节省空间） */}
            {segments.length > 1 && (
                <div className="px-3 py-2 flex flex-wrap gap-1.5 bg-slate-950/30 border-b border-slate-800">
                    {segments.map((seg, idx) => {
                        const isActive = idx === selectedIndex;
                        const label = `${formatTime(seg.start)}-${formatTime(seg.end)}`;
                        return (
                            <button
                                key={`${seg.start}-${seg.end}-${idx}`}
                                type="button"
                                onClick={() => onSelectIndex(idx)}
                                disabled={!!playbackError}
                                className={`px-2 py-1 rounded-md border text-[10px] font-mono transition-all ${isActive
                                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 ring-1 ring-indigo-400/50'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                    }`}
                                title={label}
                            >
                                #{idx + 1}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 专业时间轴引擎 (Timeline Engine) */}
            <div className="relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
                {/* 时间刻度尺 */}
                <TimelineRuler maxDuration={maxDuration} viewportWidth={800} />

                {/* 轨道容器 */}
                <div className="relative">
                    <TimelineTrack
                        maxDuration={maxDuration}
                        segments={segments}
                        selectedIndex={selectedIndex}
                        onSelectSegment={onSelectIndex}
                    />

                    {/* 播放头 */}
                    <Playhead
                        currentTime={currentTime}
                        maxDuration={maxDuration}
                        trackHeight={48}
                    />

                    {/* 点击时间轴跳转 */}
                    <div
                        className="absolute inset-0 cursor-pointer"
                        onPointerDown={(e) => {
                            if (playbackError) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const p01 = (e.clientX - rect.left) / rect.width;
                            const time = Math.max(0, Math.min(maxDuration, p01 * maxDuration));
                            onPreviewRequest(time);
                        }}
                    />

                    {/* Remove 模式：红色叠加层 */}
                    {mode === 'remove' && removeRange && (
                        <div
                            className="absolute top-0 bottom-0 bg-red-500/20 border-x-2 border-red-400 pointer-events-none"
                            style={{
                                left: `${(Math.min(removeRange.start, removeRange.end) / Math.max(maxDuration, 0.0001)) * 100}%`,
                                width: `${(Math.abs(removeRange.end - removeRange.start) / Math.max(maxDuration, 0.0001)) * 100}%`,
                            }}
                        />
                    )}
                </div>
            </div>

            {/* 底部控制区 */}
            <div className="px-3 py-2 bg-slate-900/50">
                <RangeSlider
                    min={0}
                    max={maxDuration || 100}
                    start={mode === 'remove' ? removeRange.start : start}
                    end={mode === 'remove' ? removeRange.end : end}
                    onChange={(s, e) => {
                        if (playbackError) return;
                        if (mode === 'remove') {
                            setRemoveRange({ start: s, end: e });
                        } else {
                            onChange(s, e);
                        }
                    }}
                    onPreviewRequest={playbackError ? undefined : onPreviewRequest}
                    variant={mode === 'remove' ? 'remove' : 'keep'}
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
                    <span>
                        {mode === 'remove'
                            ? `${t('editor.trim.deleteRange')}: ${formatTime(removeRange.start)} - ${formatTime(removeRange.end)}`
                            : `${t('editor.trim.start')}: ${startLabel}`}
                    </span>
                    <span>
                        {mode === 'remove'
                            ? `${t('editor.trim.deleteDuration')}: ${formatTime(removeSelectedDuration)}`
                            : `${t('editor.trim.end')}: ${endLabel}`}
                    </span>
                </div>
            </div>

            {/* 动作按钮区 */}
            <div className="px-3 py-2 border-t border-slate-800 bg-slate-950/40">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs"
                        disabled={!!playbackError}
                        onClick={onPreviewEdited}
                    >
                        <Play size={14} /> {t('editor.trim.preview')}
                    </Button>

                    {mode === 'remove' ? (
                        <Button
                            variant="danger"
                            size="sm"
                            className="w-full text-xs"
                            disabled={!canRemoveRange}
                            onClick={() => onRemoveRange(removeRange.start, removeRange.end)}
                            title={t('editor.trim.deleteSelection')}
                        >
                            <Trash2 size={14} /> {t('editor.trim.deleteSelection')}
                        </Button>
                    ) : (
                        <Button
                            variant="warning"
                            size="sm"
                            className="w-full text-xs"
                            disabled={!canSplit}
                            onClick={onSplitAtPlayhead}
                            title={t('editor.trim.splitAtPlayhead')}
                        >
                            <Scissors size={14} /> {t('editor.trim.splitAtPlayhead')}
                        </Button>
                    )}

                    {mode === 'keep' && (
                        <Button
                            variant="danger"
                            size="sm"
                            className="w-full text-xs"
                            disabled={!canDelete}
                            onClick={onDeleteSelected}
                        >
                            <Trash2 size={14} /> {t('editor.trim.deleteSegment')}
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-slate-400"
                        disabled={!!playbackError}
                        onClick={onResetTrim}
                    >
                        {t('editor.trim.reset')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
