import React from 'react';
import { Button } from '../Button';
import { ChevronDown, Settings, Download, Sparkles } from 'lucide-react';
import type { ExportFormat, ExportFrameRateOption, ExportResolution, VideoQualityPreset } from '../../types';
import { useI18n } from '../../i18n';
import { EditorExportAdvancedSettings } from './exportPanel/EditorExportAdvancedSettings';
import { EditorExportStatus } from './exportPanel/EditorExportStatus';
import { EditorExportFooterActions } from './exportPanel/EditorExportFooterActions';

interface InspectorPanelProps {
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

/**
 * 右侧检查器面板 - Final Cut Pro 风格
 * 包含导出设置、视频属性等
 */
export const InspectorPanel: React.FC<InspectorPanelProps> = ({
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
        <div className="h-full flex flex-col text-slate-300">
            {/* 面板标题 */}
            <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-white flex items-center gap-2">
                        <Download size={14} className="text-green-400" />
                        {t('editor.export.title')}
                    </h2>
                    <button
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                        onClick={onToggleAdvanced}
                        type="button"
                    >
                        <Settings size={12} className="text-purple-300" />
                        <ChevronDown size={12} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                    {t(`quality.${selectedQuality}.label`)} • {selectedFormat.toUpperCase()} • {selectedFps}fps
                </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-3 space-y-3">
                    {/* 快速预设 */}
                    <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={12} className="text-purple-400" />
                            <span className="text-[11px] font-medium text-white">{t('editor.export.quickHint')}</span>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onApplyHighQualityPreset}
                            className="w-full text-[10px] py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border-purple-500/30"
                            disabled={isProcessing}
                        >
                            <Sparkles size={10} className="mr-1" />
                            {t('editor.export.quickButton')}
                        </Button>
                    </div>

                    {/* 预估大小 */}
                    <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg px-3 py-2">
                        <span className="text-slate-400">{t('editor.export.estimated')}</span>
                        <span className="text-indigo-300 font-mono font-medium">{estimatedSize}</span>
                    </div>

                    {/* 高级设置 */}
                    {showAdvanced && (
                        <div className="border-t border-slate-800/50 pt-3">
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
                        </div>
                    )}

                    {/* 导出状态 */}
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
            </div>

            {/* 底部操作按钮 */}
            <div className="px-3 py-3 border-t border-slate-800 bg-slate-900/50">
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
    );
};
