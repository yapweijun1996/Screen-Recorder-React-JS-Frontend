import React from 'react';
import { Button } from '../Button';
import { FileVideo, RotateCcw, ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n';

interface EditorHeaderProps {
    onReset: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({ onReset }) => {
    const { t } = useI18n();

    const converterUrl = `${window.location.pathname}?page=converter`;

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-2xl font-bold text-th-primary flex items-center gap-2">
                    <FileVideo className="text-indigo-600 dark:text-indigo-400" />
                    {t('editor.header.title')}
                </h2>
                <p className="text-xs text-th-tertiary mt-1">
                    {t('editor.header.subtitle')}
                </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <a
                    href={converterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-th-edge text-th-secondary hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                    <ExternalLink size={13} />
                    {t('converter.nav')}
                </a>
                <Button variant="ghost" onClick={onReset}>
                    <RotateCcw size={16} />
                    {t('editor.header.recordNew')}
                </Button>
            </div>
        </div>
    );
};
