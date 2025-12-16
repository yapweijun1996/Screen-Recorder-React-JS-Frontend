import React from 'react';
import { Button } from '../Button';
import { ChevronDown, Settings } from 'lucide-react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../types';
import { useI18n } from '../../i18n';
import { EditorExportAdvancedSettings } from './exportPanel/EditorExportAdvancedSettings';
import { EditorExportFooterActions } from './exportPanel/EditorExportFooterActions';
import { EditorExportStatus } from './exportPanel/EditorExportStatus';

interface EditorExportPanelProps {
    // state
    showAdvanced: boolean;
    onToggleAdvanced: () => void;

    selectedQuality: VideoQualityPreset;
    onSelectQuality: (preset: VideoQualityPreset) => void;

    selectedResolution: ExportResolution;
    onSelectResolution: (res: ExportResolution) => void;

    selectedFormat: ExportFormat;
    onSelectFormat: (fmt: ExportFormat) => void;

    selectedFps: ExportFrameRateOption;
    onSelectFps: (fps: ExportFrameRateOption) => void;

    customCrf: number;
    onChangeCrf: (crf: number) => void;

    estimatedSize: string;

    isProcessing: boolean;
    processingProgress: number;
    processingEta: string | null;

    exportUrl: string | null;
    exportError: string | null;

    playbackError: string | null;

    // actions
    onApplyHighQualityPreset: () => void;
    onExportTrimmed: () => void;
    onExportFull: () => void;
    onClearExportUrl: () => void;
    onClearExportError: () => void;

    // download
    downloadFileName: string;
}

export const EditorExportPanel: React.FC<EditorExportPanelProps> = ({
    showAdvanced,
    onToggleAdvanced,
    selectedQuality,
    onSelectQuality,
    selectedResolution,
    onSelectResolution,
    selectedFormat,
    onSelectFormat,
    selectedFps,
    onSelectFps,
    customCrf,
    onChangeCrf,
    estimatedSize,
    isProcessing,
    processingProgress,
    processingEta,
    exportUrl,
    exportError,
    playbackError,
    onApplyHighQualityPreset,
    onExportTrimmed,
    onExportFull,
    onClearExportUrl,
    onClearExportError,
    downloadFileName,
}) => {
    const { t } = useI18n();

    return (
        <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur">
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{t('editor.export.title')}</div>
                            <div className="text-xs text-slate-400">
                                {t(`quality.${selectedQuality}.label`)} • {selectedFormat.toUpperCase()}
                            </div>
                        </div>

                        <button
                            className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
                            onClick={onToggleAdvanced}
                            type="button"
                        >
                            <Settings size={16} className="text-purple-300" />
                            {t('editor.export.settings')}
                            <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Quick preset helper */}
                    <div className="flex items-center justify-between gap-2 bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-400">
                            {t('editor.export.quickHint')}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onApplyHighQualityPreset}
                            className="text-xs px-3"
                            disabled={isProcessing}
                        >
                            {t('editor.export.quickButton')}
                        </Button>
                    </div>

                    {/* Estimated size */}
                    <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>{t('editor.export.estimated')}</span>
                        <span className="text-indigo-300 font-medium">{estimatedSize}</span>
                    </div>

                    {showAdvanced && (
                        <EditorExportAdvancedSettings
                            selectedQuality={selectedQuality}
                            onSelectQuality={onSelectQuality}
                            selectedResolution={selectedResolution}
                            onSelectResolution={onSelectResolution}
                            selectedFormat={selectedFormat}
                            onSelectFormat={onSelectFormat}
                            selectedFps={selectedFps}
                            onSelectFps={onSelectFps}
                            customCrf={customCrf}
                            onChangeCrf={onChangeCrf}
                            isProcessing={isProcessing}
                        />
                    )}

                    <EditorExportStatus
                        isProcessing={isProcessing}
                        processingProgress={processingProgress}
                        processingEta={processingEta}
                        exportUrl={exportUrl}
                        exportError={exportError}
                        selectedFormat={selectedFormat}
                        downloadFileName={downloadFileName}
                        onClearExportUrl={onClearExportUrl}
                        onClearExportError={onClearExportError}
                    />
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/70">
                    <EditorExportFooterActions
                        exportUrl={exportUrl}
                        playbackError={playbackError}
                        isProcessing={isProcessing}
                        selectedQuality={selectedQuality}
                        onExportTrimmed={onExportTrimmed}
                        onExportFull={onExportFull}
                    />
                </div>
            </div>
        </aside>
    );
};

