import { AudioExportError } from './AudioExportError';

export const getExportErrorMessage = (
    error: unknown,
    t: (key: string) => string,
    fallbackKey: string,
): string => error instanceof AudioExportError
    ? t(`export.audio.${error.code}`)
    : t(fallbackKey);
