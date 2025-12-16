import React, { useEffect, useMemo, useState } from 'react';
import { RangeSlider } from '../RangeSlider';
import { Button } from '../Button';
import { Play, Scissors, Trash2, Undo2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { formatTime } from '../../utils/format';
import { SegmentsTimeline } from './SegmentsTimeline';

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
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Scissors size={18} className="text-indigo-400" />
                    <h3 className="font-semibold text-slate-200">{t('editor.trim.title')}</h3>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                    {t('editor.trim.totalSelected')}: <span className="text-indigo-300">{totalSelectedLabel}</span>
                </div>
            </div>

            {/* Mode toggle */}
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
                    <button
                        type="button"
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${mode === 'keep'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:text-white'
                            }`}
                        onClick={() => setMode('keep')}
                        disabled={!!playbackError}
                    >
                        {t('editor.trim.mode.keep')}
                    </button>
                    <button
                        type="button"
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${mode === 'remove'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:text-white'
                            }`}
                        onClick={() => setMode('remove')}
                        disabled={!!playbackError}
                    >
                        {t('editor.trim.mode.remove')}
                    </button>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    disabled={!canUndo}
                    onClick={onUndo}
                    title={t('editor.trim.undo')}
                >
                    <Undo2 size={14} /> {t('editor.trim.undo')}
                </Button>
            </div>

            <div
                className={`mb-3 text-[11px] ${mode === 'remove' && !removeIntersectsKept
                    ? 'text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2'
                    : 'text-slate-500'
                    }`}
            >
                {mode === 'remove'
                    ? (removeIntersectsKept ? t('editor.trim.removeHint') : t('editor.trim.removeNoOverlap'))
                    : t('editor.trim.keepHint')}
            </div>

            {/* Segments list */}
            <div className="mb-3 flex flex-wrap gap-2">
                {segments.map((seg, idx) => {
                    const isActive = idx === selectedIndex;
                    const label = `${formatTime(seg.start)} - ${formatTime(seg.end)}`;
                    return (
                        <button
                            key={`${seg.start}-${seg.end}-${idx}`}
                            type="button"
                            onClick={() => onSelectIndex(idx)}
                            disabled={!!playbackError}
                            className={`px-3 py-1.5 rounded-full border text-xs font-mono transition-colors ${isActive
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                                : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                }`}
                            title={label}
                        >
                            #{idx + 1} {label}
                        </button>
                    );
                })}
            </div>

            <SegmentsTimeline
                maxDuration={maxDuration}
                segments={segments}
                selectedIndex={selectedIndex}
                currentTime={currentTime}
                mode={mode}
                removeRange={mode === 'remove' ? removeRange : undefined}
                onSeek={(time) => onPreviewRequest(time)}
            />

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
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
                <div className="flex justify-between text-[11px] text-slate-500 mt-2 font-mono">
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

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={!!playbackError}
                    onClick={onPreviewEdited}
                >
                    <Play size={14} /> {t('editor.trim.preview')}
                </Button>

                {mode === 'remove' ? (
                    <Button
                        variant="danger"
                        size="sm"
                        className="w-full"
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
                        className="w-full"
                        disabled={!canSplit}
                        onClick={onSplitAtPlayhead}
                        title={t('editor.trim.splitAtPlayhead')}
                    >
                        <Scissors size={14} /> {t('editor.trim.splitAtPlayhead')}
                    </Button>
                )}

                {mode === 'keep' ? (
                    <Button
                        variant="danger"
                        size="sm"
                        className="w-full"
                        disabled={!canDelete}
                        onClick={onDeleteSelected}
                    >
                        <Trash2 size={14} /> {t('editor.trim.deleteSegment')}
                    </Button>
                ) : (
                    <div className="hidden lg:block" />
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-slate-300"
                    disabled={!!playbackError}
                    onClick={onResetTrim}
                >
                    {t('editor.trim.reset')}
                </Button>
            </div>
        </div>
    );
};
