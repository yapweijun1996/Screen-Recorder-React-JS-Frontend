import React from 'react';
import { Play } from 'lucide-react';
import type { Cue } from '../../../services/stt/protocol';
import { formatTimestamp } from './format';
import type { Translate } from './types';

interface CueListProps {
    cues: Cue[];
    labelId: string;
    onSeek?: (seconds: number) => void;
    updateCue: (id: string, text: string) => void;
    t: Translate;
}

export const CueList: React.FC<CueListProps> = ({ cues, labelId, onSeek, updateCue, t }) => (
    <section aria-labelledby={labelId}>
        <div className="mb-2 flex items-center justify-between gap-2">
            <p id={labelId} className="text-xs font-medium text-th-secondary">
                {t('editor.transcript.ready')}
            </p>
            <span className="text-[10px] text-th-tertiary">
                {cues.length} {t('editor.transcript.cueCount')}
            </span>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-80">
            {cues.map((cue) => {
                const timestamp = formatTimestamp(cue.start);
                const cueId = `${labelId}-${cue.id}`;
                const seekLabel = t('editor.transcript.seek', { time: timestamp });
                return (
                    <div key={cue.id} className="flex gap-2 rounded-lg border border-th-edge bg-th-card/40 p-2">
                        {onSeek ? <button
                            type="button"
                            title={seekLabel}
                            aria-label={seekLabel}
                            onClick={() => onSeek(cue.start)}
                            className="flex h-8 min-w-[3.5rem] shrink-0 items-center justify-center gap-1 rounded-md bg-th-input px-1.5 text-[10px] font-mono text-th-secondary transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-indigo-300"
                        >
                            <Play size={10} fill="currentColor" aria-hidden="true" />
                            {timestamp}
                        </button> : <span className="shrink-0 px-1.5 py-2 font-mono text-[10px] text-th-secondary">{timestamp}</span>}
                        <label htmlFor={cueId} className="sr-only">
                            {t('editor.transcript.editCue', { time: timestamp })}
                        </label>
                        <textarea
                            id={cueId}
                            data-testid="transcript-cue-text"
                            value={cue.text}
                            rows={2}
                            onChange={(event) => updateCue(cue.id, event.currentTarget.value)}
                            className="min-h-8 min-w-0 flex-1 resize-y rounded-md border border-transparent bg-transparent px-2 py-1 text-xs leading-5 text-th-primary outline-none transition-colors placeholder:text-th-tertiary focus:border-indigo-400 focus:bg-th-input/50 focus:ring-2 focus:ring-indigo-500/30"
                        />
                    </div>
                );
            })}
        </div>
    </section>
);
