import type { VideoMetadata } from '../types';
import { useI18n } from '../i18n';
import { generateFileName } from '../utils/format';
import type { StorageIssue } from './useVideoSession';

export function StorageNotice({ issue, video }: { issue: StorageIssue; video: VideoMetadata | null }) {
    const { t } = useI18n();
    const extension = video?.blob.type.includes('mp4') ? 'mp4' : 'webm';
    return (
        <div role="alert" className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
            <span className="text-sm">{t(`app.storage.${issue}`)}</span>
            {video && (
                <a href={video.url} download={generateFileName('screen-recording-original', extension)} className="text-sm font-semibold underline underline-offset-2">
                    {t('app.storage.downloadOriginal')}
                </a>
            )}
        </div>
    );
}
