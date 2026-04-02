import React from 'react';
import { useI18n } from '../i18n';
import type { LanguageCode } from '../i18n';

interface LanguageSelectorProps {
    className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ className = '' }) => {
    const { language, setLanguage, languages, t } = useI18n();

    return (
        <label className={`flex items-center gap-2 text-xs text-th-tertiary ${className}`}>
            <span className="hidden sm:inline">{t('common.language')}:</span>
            <select
                value={language}
                onChange={(e) => {
                    // 避免 `as any`：先用 languages 做 runtime guard，再轉成 LanguageCode
                    const next = e.target.value;
                    if (languages.some((l) => l.code === next)) {
                        setLanguage(next as LanguageCode);
                    }
                }}
                className="bg-th-base border border-th-divider text-th-primary rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.label}
                    </option>
                ))}
            </select>
        </label>
    );
};
