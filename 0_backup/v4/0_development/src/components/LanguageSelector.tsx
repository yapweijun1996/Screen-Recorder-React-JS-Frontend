import React from 'react';
import { useI18n } from '../i18n';

interface LanguageSelectorProps {
    className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ className = '' }) => {
    const { language, setLanguage, languages, t } = useI18n();

    return (
        <label className={`flex items-center gap-2 text-xs text-slate-400 ${className}`}>
            <span className="hidden sm:inline">{t('common.language')}:</span>
            <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
