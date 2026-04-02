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
        <aside className="lg:col-span-3 lg:sticky lg:top-20">
            <div className="bg-th-base/70 border border-th-edge rounded-xl overflow-hidden shadow-2xl backdrop-blur">
                {/* 顶部标题栏 */}
                <div className="px-3 py-2 border-b border-th-edge bg-gradient-to-b from-th-base to-th-base/80">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-th-primary">{t('editor.export.title')}</div>
                            <div className="text-[10px] text-th-secondary">
                                {t(`quality.${selectedQuality}.label`)} • {selectedFormat.toUpperCase()}
                            </div>
                        </div>

                        <button
                            className="flex items-center gap-1.5 text-[10px] text-th-secondary hover:text-th-primary transition-colors"
                            onClick={onToggleAdvanced}
                            type="button"
                        >
                            <Settings size={14} className="text-accent-purple" />
                            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="p-3 space-y-3 max-h-[50vh] overflow-y-auto">
                    {/* Quick preset helper */}
                    <div className="flex items-center justify-between gap-2 bg-th-deep/50 border border-th-edge rounded-lg px-2 py-1.5">
                        <div className="text-[10px] text-th-secondary">
                            {t('editor.export.quickHint')}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onApplyHighQualityPreset}
                            className="text-[10px] px-2 py-0.5"
                            disabled={isProcessing}
                        >
                            {t('editor.export.quickButton')}
                        </Button>
                    </div>

                    {/* Estimated size */}
                    <div className="flex items-center justify-between text-xs text-th-secondary">
                        <span>{t('editor.export.estimated')}</span>
                        <span className="text-accent-indigo font-medium">{estimatedSize}</span>
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

                <div className="px-3 py-2 border-t border-th-edge bg-th-deep/40">
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

