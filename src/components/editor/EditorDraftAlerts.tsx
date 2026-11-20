import React from 'react';
import { useI18n } from '../../i18n';

interface EditorDraftAlertsProps {
    draftBlocked: boolean;
    draftSavePending: boolean;
    onReset: () => void;
    onRetry: () => void;
}

const alertClassName = 'px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3 flex-shrink-0';

export const EditorDraftAlerts: React.FC<EditorDraftAlertsProps> = ({
    draftBlocked,
    draftSavePending,
    onReset,
    onRetry,
}) => {
    const { t } = useI18n();

    return (
        <>
            {draftBlocked && (
                <div role="alert" className={alertClassName}>
                    <span className="text-sm">{t('editor.draft.invalid')}</span>
                    <button type="button" className="text-sm font-semibold underline underline-offset-2" onClick={onReset}>
                        {t('editor.draft.reset')}
                    </button>
                </div>
            )}
            {draftSavePending && (
                <div data-draft-save-pending role="alert" className={alertClassName}>
                    <span className="text-sm">{t('editor.draft.savePending')}</span>
                    <button data-draft-save-retry type="button" className="text-sm font-semibold underline underline-offset-2" onClick={onRetry}>
                        {t('editor.draft.retry')}
                    </button>
                </div>
            )}
        </>
    );
};
