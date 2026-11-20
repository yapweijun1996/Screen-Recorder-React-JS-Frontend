import React from 'react';
import { Download } from 'lucide-react';
import type { VideoQualityPreset } from '../../../types';
import { VIDEO_QUALITY_PRESETS } from '../../../types';
import { Button } from '../../Button';
import { useI18n } from '../../../i18n';
import { useEditorDraft } from '../EditorDraftContext';

interface EditorExportFooterActionsProps {
    exportUrl: string | null;
    playbackError: string | null;
    isProcessing: boolean;
    selectedQuality: VideoQualityPreset;

    rawDownloadUrl: string;
    rawDownloadFileName: string;

    onExportTrimmed: () => void;
    onExportFull: () => void;
    onExportMp3: () => void;
}

export const EditorExportFooterActions: React.FC<EditorExportFooterActionsProps> = ({
    exportUrl,
    playbackError,
    isProcessing,
    selectedQuality,
    rawDownloadUrl,
    rawDownloadFileName,
    onExportTrimmed,
    onExportFull,
    onExportMp3,
}) => {
    const { t } = useI18n();
    const { draftBlocked } = useEditorDraft();

    if (exportUrl) return null;

    return (
        <div className="space-y-2">
            <Button
                variant="primary"
                className="w-full py-3"
                onClick={onExportTrimmed}
                isLoading={isProcessing}
                disabled={!!playbackError || isProcessing || draftBlocked}
            >
                {t('editor.export.exportTrimmed', { label: t(`quality.${selectedQuality}.label`) })}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-th-secondary"
                onClick={onExportFull}
                disabled={!!playbackError || isProcessing}
            >
                {t('editor.export.exportFull')}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-th-secondary"
                onClick={onExportMp3}
                disabled={!!playbackError || isProcessing}
            >
                {t('editor.export.exportMp3', {
                    bitrate: Number.parseInt(VIDEO_QUALITY_PRESETS[selectedQuality].audioBitrate, 10),
                })}
            </Button>

            <a
                href={rawDownloadUrl}
                download={rawDownloadFileName}
                className="flex items-center justify-center gap-1.5 w-full text-xs text-th-tertiary hover:text-th-secondary py-1.5 transition-colors"
            >
                <Download size={12} />
                {t('editor.export.downloadRaw')}
            </a>

            {playbackError && (
                <div className="mt-3 text-[11px] text-th-tertiary">
                    {t('editor.export.playbackIssue')}
                </div>
            )}
        </div>
    );
};

