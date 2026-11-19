import React, { useCallback, useRef, useState } from 'react';
import { Mic2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Language } from '../../services/stt/protocol';
import { useTranscription } from './useTranscription';
import { TranscriptDialog } from './transcript/TranscriptDialog';

export interface TranscriptPanelProps {
    /** Move the editor player to a caption's start time. */
    onSeek?: (seconds: number) => void;
    titleKey?: string;
    initiallyOpen?: boolean;
}

/** Entry point for the local caption generator. The dialog owns its workflow UI. */
export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ onSeek, titleKey = 'editor.transcript.title', initiallyOpen = false }) => {
    const { t } = useI18n();
    const transcription = useTranscription();
    const [open, setOpen] = useState(initiallyOpen);
    const [language, setLanguage] = useState<Language>('auto');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const close = useCallback(() => {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    }, []);

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                data-testid="transcript-trigger"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-th-edge bg-th-card px-3 py-1.5 text-xs font-medium text-th-secondary transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
            >
                <Mic2 size={13} aria-hidden="true" />
                <span>{t(titleKey)}</span>
                {transcription.cues.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                        {transcription.cues.length}
                    </span>
                )}
            </button>

            {open && (
                <TranscriptDialog
                    state={transcription}
                    language={language}
                    onLanguageChange={setLanguage}
                    onSeek={onSeek}
                    titleKey={titleKey}
                    onClose={close}
                />
            )}
        </>
    );
};
