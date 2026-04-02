import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { LanguageCode, LanguageOption, TranslationTable } from './types';

import de from './locales/de';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import hi from './locales/hi';
import id from './locales/id';
import ja from './locales/ja';
import ko from './locales/ko';
import pt from './locales/pt';
import zh from './locales/zh';

export type { LanguageCode, LanguageOption, TranslationTable } from './types';

const LANGUAGE_STORAGE_KEY = 'screenclip.language';
const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '简体中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Português' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'id', label: 'Bahasa Indonesia' },
];

/**
 * 語系字典（拆分檔案，降低單檔維護成本）
 * - 每個語系一個檔案：`src/i18n/locales/*.ts`
 * - 這裡只做集中註冊與 t() 查詢
 */
const translations: Record<LanguageCode, TranslationTable> = {
    en,
    zh,
    ja,
    ko,
    es,
    fr,
    de,
    pt,
    hi,
    id,
};

interface I18nContextValue {
    language: LanguageCode;
    setLanguage: (code: LanguageCode) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    languages: LanguageOption[];
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const getValue = (lang: LanguageCode, key: string): string | undefined => {
    const table = translations[lang];
    return table?.[key];
};

const formatParams = (value: string, params?: Record<string, string | number>) => {
    if (!params) return value;
    return value.replace(/\{\{(.*?)\}\}/g, (_, rawKey) => {
        const paramKey = String(rawKey).trim();
        const val = params[paramKey];
        return val !== undefined ? String(val) : '';
    });
};

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode | null;
        if (saved && translations[saved]) {
            setLanguageState(saved);
        }
    }, []);

    const setLanguage = (code: LanguageCode) => {
        if (!translations[code]) return;
        setLanguageState(code);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
        }
    };

    const value = useMemo<I18nContextValue>(() => ({
        language,
        setLanguage,
        languages: LANGUAGE_OPTIONS,
        t: (key: string, params?: Record<string, string | number>) => {
            const raw = getValue(language, key) ?? getValue(DEFAULT_LANGUAGE, key) ?? key;
            return formatParams(raw, params);
        }
    }), [language]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = () => {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return ctx;
};

