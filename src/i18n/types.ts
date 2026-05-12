export type LanguageCode = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'pt' | 'hi' | 'id';

export interface LanguageOption {
    code: LanguageCode;
    label: string;
}

export type TranslationTable = Record<string, string>;

