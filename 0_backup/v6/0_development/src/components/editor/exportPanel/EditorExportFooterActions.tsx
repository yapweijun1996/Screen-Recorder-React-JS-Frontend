import React from 'react';
import type { VideoQualityPreset } from '../../../types';
import { Button } from '../../Button';
import { useI18n } from '../../../i18n';

interface EditorExportFooterActionsProps {
    exportUrl: string | null;
    playbackError: string | null;
    isProcessing: boolean;
    selectedQuality: VideoQualityPreset;

    onExportTrimmed: () => void;
    onExportFull: () => void;
}

export const EditorExportFooterActions: React.FC<EditorExportFooterActionsProps> = ({
    exportUrl,
    playbackError,
    isProcessing,
    selectedQuality,
    onExportTrimmed,
    onExportFull,
}) => {
    const { t } = useI18n();

    if (exportUrl) return null;

    return (
        <div className="space-y-2">
            <Button
                variant="primary"
                className="w-full py-3"
                onClick={onExportTrimmed}
                isLoading={isProcessing}
                disabled={!!playbackError || isProcessing}
            >
                {t('editor.export.exportTrimmed', { label: t(`quality.${selectedQuality}.label`) })}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-slate-300"
                onClick={onExportFull}
                disabled={!!playbackError || isProcessing}
            >
                {t('editor.export.exportFull')}
            </Button>

            {playbackError && (
                <div className="mt-3 text-[11px] text-slate-500">
                    {t('editor.export.playbackIssue')}
                </div>
            )}
        </div>
    );
};

