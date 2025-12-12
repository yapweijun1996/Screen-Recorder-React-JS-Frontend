import React from 'react';
import { Button } from '../Button';
import { FileVideo, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';

interface EditorHeaderProps {
    onReset: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({ onReset }) => {
    const { t } = useI18n();

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FileVideo className="text-indigo-400" />
                    {t('editor.header.title')}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                    {t('editor.header.subtitle')}
                </p>
            </div>

            <Button variant="ghost" onClick={onReset} className="shrink-0">
                <RotateCcw size={16} />
                {t('editor.header.recordNew')}
            </Button>
        </div>
    );
};
