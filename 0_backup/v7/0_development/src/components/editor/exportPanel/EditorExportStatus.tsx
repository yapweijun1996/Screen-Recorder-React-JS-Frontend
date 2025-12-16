import React from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { ExportFormat } from '../../../types';
import { useI18n } from '../../../i18n';

interface EditorExportStatusProps {
    isProcessing: boolean;
    processingProgress: number;
    processingEta: string | null;

    exportUrl: string | null;
    exportError: string | null;

    selectedFormat: ExportFormat;
    downloadFileName: string;

    onClearExportUrl: () => void;
    onClearExportError: () => void;
}

export const EditorExportStatus: React.FC<EditorExportStatusProps> = ({
    isProcessing,
    processingProgress,
    processingEta,
    exportUrl,
    exportError,
    selectedFormat,
    downloadFileName,
    onClearExportUrl,
    onClearExportError,
}) => {
    const { t } = useI18n();

    return (
        <div className="space-y-3">
            {exportError && !isProcessing && (
                <div className="bg-red-900/20 border border-red-500/30 p-3 rounded-xl text-red-200 flex items-start justify-between gap-3 animate-fade-in">
                    <span className="text-xs leading-relaxed">{exportError}</span>
                    <button
                        type="button"
                        onClick={onClearExportError}
                        className="text-red-200/80 hover:text-white"
                        aria-label={t('common.dismiss')}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {isProcessing && (
                <div className="bg-indigo-900/25 border border-indigo-500/30 p-4 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-indigo-300">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-sm font-medium">{t('editor.export.processing')}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                            style={{ width: `${processingProgress}%` }}
                        />
                    </div>
                    <div className="text-[11px] text-slate-400 flex justify-between">
                        <span>{processingProgress}%</span>
                        <span>{t('editor.export.eta')}: {processingEta ?? t('editor.export.etaEstimating')}</span>
                    </div>
                </div>
            )}

            {exportUrl && !isProcessing && (
                <div className="bg-emerald-900/25 border border-emerald-500/30 p-4 rounded-xl text-center space-y-3 animate-fade-in">
                    <p className="text-emerald-300 text-sm font-medium">{t('editor.export.ready')}</p>
                    <a
                        href={exportUrl}
                        download={downloadFileName}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
                    >
                        <Download size={20} />
                        {t('editor.export.download', { format: selectedFormat.toUpperCase() })}
                    </a>
                    <button
                        onClick={onClearExportUrl}
                        className="text-slate-400 text-xs hover:text-white underline"
                        type="button"
                    >
                        {t('editor.export.exportAnother')}
                    </button>
                </div>
            )}
        </div>
    );
};
