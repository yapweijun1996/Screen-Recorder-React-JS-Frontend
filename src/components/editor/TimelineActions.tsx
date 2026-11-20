import React from 'react';
import { Play, Scissors, Trash2, Undo2, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';

interface Props {
    currentTime: number;
    canSplit: boolean;
    canDelete: boolean;
    canUndo: boolean;
    splitDisabledReason?: string;
    onPreviewEdited?: () => void;
    onSplitAt?: (time: number) => void;
    onDeleteSelected?: () => void;
    onUndo?: () => void;
    onResetTrim?: () => void;
}
export function TimelineActions({ currentTime, canSplit, canDelete, canUndo, splitDisabledReason, onPreviewEdited, onSplitAt, onDeleteSelected, onUndo, onResetTrim }: Props) {
    const { t } = useI18n();
    return (
    <div className="flex items-center gap-0.5 sm:gap-1">
        {/* Preview */}
        <button
            type="button"
            onClick={onPreviewEdited}
            className="
                group relative flex items-center gap-1
                px-1.5 sm:px-2 py-1 text-[10px] rounded-md
                bg-th-card/50 text-th-secondary
                hover:bg-th-input hover:text-th-primary
                transition-all border border-th-divider
            "
            title={t('editor.trim.preview')}
        >
            <Play size={12} />
            <span className="hidden md:inline">{t('editor.trim.preview')}</span>
        </button>

        {/* Split */}
        <div className="relative group">
            <button
                type="button"
                onClick={() => onSplitAt?.(currentTime)}
                disabled={!canSplit}
                className="
                    flex items-center gap-1
                    px-1.5 sm:px-2 py-1 text-[10px] rounded-md
                    bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-300
                    hover:bg-amber-200 dark:hover:bg-amber-600/40
                    transition-all border border-amber-300 dark:border-amber-600/30
                    disabled:opacity-40 disabled:cursor-not-allowed
                "
                title={splitDisabledReason ?? `${t('editor.trim.splitAtPlayhead')} (B)`}
            >
                <Scissors size={12} />
                <span className="hidden md:inline">{t('editor.trim.splitAtPlayhead')}</span>
            </button>
            {/* Minimum split distance */}
            {!canSplit && (
                <div className="
                    hidden group-hover:block
                    absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50
                    bg-th-surface/95 backdrop-blur-md
                    text-[9px] text-amber-700 dark:text-amber-300
                    px-2 py-1 rounded
                    border border-amber-600/30
                    whitespace-nowrap
                    shadow-lg
                ">
                    {splitDisabledReason ?? '需要距离片段两端至少 0.5s'}
                </div>
            )}
        </div>

        {/* Delete */}
        <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!canDelete}
            className="
                flex items-center gap-1
                px-1.5 sm:px-2 py-1 text-[10px] rounded-md
                bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-300
                hover:bg-red-200 dark:hover:bg-red-600/40
                transition-all border border-red-300 dark:border-red-600/30
                disabled:opacity-40 disabled:cursor-not-allowed
            "
            title={`${t('editor.trim.deleteSegment')} (Del)`}
        >
            <Trash2 size={12} />
            <span className="hidden md:inline">{t('editor.trim.deleteSegment')}</span>
        </button>

        {/* Desktop separator */}
        <div className="hidden sm:block w-px h-4 bg-th-divider/50 mx-0.5" />

        {/* Undo */}
        <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="
                p-1.5 rounded-md
                text-th-secondary hover:text-th-primary hover:bg-th-input
                transition-all border border-th-divider/50
                disabled:opacity-40 disabled:cursor-not-allowed
            "
            title={`${t('editor.trim.undo')} (⌘Z)`}
        >
            <Undo2 size={12} />
        </button>

        {/* Reset */}
        <button
            type="button"
            onClick={onResetTrim}
            className="
                p-1.5 rounded-md
                text-th-secondary hover:text-th-primary hover:bg-th-input
                transition-all border border-th-divider/50
            "
            title={t('editor.trim.reset')}
        >
            <RotateCcw size={12} />
        </button>
    </div>
    );
}
