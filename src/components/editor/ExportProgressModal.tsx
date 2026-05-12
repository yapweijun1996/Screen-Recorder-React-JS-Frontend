import React from 'react';
import { useI18n } from '../../i18n';

interface ExportProgressModalProps {
    progress: number; // 0-100
    eta: string | null;
    format: string;
    onCancel?: () => void;
}

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
    progress,
    eta,
    format,
    onCancel,
}) => {
    const { t } = useI18n();
    const clampedProgress = Math.min(100, Math.max(0, progress));
    const circumference = 2 * Math.PI * 54; // radius=54
    const strokeOffset = circumference - (clampedProgress / 100) * circumference;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 dark:bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-6 bg-th-surface border border-th-edge rounded-2xl shadow-2xl px-10 py-8 max-w-sm w-full mx-4">
                {/* Circular SVG progress */}
                <div className="relative w-32 h-32">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                        {/* Background circle */}
                        <circle
                            cx="60" cy="60" r="54"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            className="text-th-edge"
                        />
                        {/* Progress arc */}
                        <circle
                            cx="60" cy="60" r="54"
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="8"
                            strokeLinecap="round"
                            className="transition-all duration-300 ease-out"
                            style={{
                                strokeDasharray: circumference,
                                strokeDashoffset: strokeOffset,
                            }}
                        />
                    </svg>
                    {/* Percentage text */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold font-mono text-th-primary">
                            {clampedProgress}%
                        </span>
                    </div>
                </div>

                {/* Status text */}
                <div className="text-center space-y-1">
                    <h3 className="text-base font-semibold text-th-primary">
                        {t('editor.export.processing')}
                    </h3>
                    <p className="text-sm text-th-secondary">
                        {t('editor.export.modalExporting', { format: format.toUpperCase() })}
                    </p>
                </div>

                {/* ETA */}
                {eta && (
                    <div className="text-sm font-mono text-th-tertiary">
                        {t('editor.export.eta')}: {eta}
                    </div>
                )}

                {/* Stay on tab warning */}
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                        {t('editor.export.modalStayHint')}
                    </span>
                </div>

                {/* Cancel button */}
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="w-full px-4 py-2 text-sm font-medium rounded-lg border border-th-edge text-th-primary hover:bg-th-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-th-input"
                    >
                        {t('editor.export.cancel')}
                    </button>
                )}
            </div>
        </div>
    );
};
