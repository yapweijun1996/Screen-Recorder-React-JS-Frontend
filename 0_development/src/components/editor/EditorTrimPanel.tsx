import React from 'react';
import { RangeSlider } from '../RangeSlider';
import { Button } from '../Button';
import { Play, Scissors } from 'lucide-react';

interface EditorTrimPanelProps {
    playbackError: string | null;

    maxDuration: number;
    start: number;
    end: number;

    startLabel: string;
    endLabel: string;
    durationLabel: string;

    onChange: (start: number, end: number) => void;
    onPreviewRequest: (time: number) => void;

    onPreviewSelection: () => void;
    onResetTrim: () => void;
}

export const EditorTrimPanel: React.FC<EditorTrimPanelProps> = ({
    playbackError,
    maxDuration,
    start,
    end,
    startLabel,
    endLabel,
    durationLabel,
    onChange,
    onPreviewRequest,
    onPreviewSelection,
    onResetTrim,
}) => {
    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Scissors size={18} className="text-indigo-400" />
                    <h3 className="font-semibold text-slate-200">Trim</h3>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                    Duration: <span className="text-indigo-300">{durationLabel}</span>
                </div>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                <RangeSlider
                    min={0}
                    max={maxDuration || 100}
                    start={start}
                    end={end}
                    onChange={(s, e) => !playbackError && onChange(s, e)}
                    onPreviewRequest={playbackError ? undefined : onPreviewRequest}
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-2 font-mono">
                    <span>Start: {startLabel}</span>
                    <span>End: {endLabel}</span>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={!!playbackError}
                    onClick={onPreviewSelection}
                >
                    <Play size={14} /> Preview Selection
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-slate-300"
                    disabled={!!playbackError}
                    onClick={onResetTrim}
                >
                    Reset Trim
                </Button>
            </div>
        </div>
    );
};