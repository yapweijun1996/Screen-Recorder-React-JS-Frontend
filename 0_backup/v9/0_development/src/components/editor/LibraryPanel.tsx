import React from 'react';
import { Film, Music, Image, Folder, Clock, Star } from 'lucide-react';
import { useI18n } from '../../i18n';
import { formatTime, formatBytes } from '../../utils/format';

interface LibraryPanelProps {
    videoInfo?: {
        name: string;
        duration: number;
        size: number;
        url: string;
    };
    segmentCount?: number;
    totalSelectedDuration?: number;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
    videoInfo,
    segmentCount = 1,
    totalSelectedDuration = 0,
}) => {
    const { t } = useI18n();

    return (
        <div className="h-full flex flex-col text-th-secondary">
            {/* 面板标题 */}
            <div className="px-3 py-2 border-b border-th-edge bg-th-card/50">
                <h2 className="text-xs font-semibold text-th-primary flex items-center gap-2">
                    <Folder size={14} className="text-blue-500 dark:text-blue-400" />
                    {t('editor.library.title')}
                </h2>
            </div>

            {/* 媒体浏览器 */}
            <div className="flex-1 overflow-y-auto">
                {/* 分类标签 */}
                <div className="px-2 py-2 space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                        <Film size={12} />
                        <span>{t('editor.library.videos')}</span>
                        <span className="ml-auto text-[10px] bg-blue-100 dark:bg-blue-600/30 px-1.5 rounded">1</span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-card text-th-muted text-xs cursor-not-allowed opacity-50">
                        <Music size={12} />
                        <span>{t('editor.library.audio')}</span>
                        <span className="ml-auto text-[10px] bg-th-card px-1.5 rounded">0</span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-card text-th-muted text-xs cursor-not-allowed opacity-50">
                        <Image size={12} />
                        <span>{t('editor.library.images')}</span>
                        <span className="ml-auto text-[10px] bg-th-card px-1.5 rounded">0</span>
                    </div>
                </div>

                {/* 当前素材 */}
                {videoInfo && (
                    <div className="px-2 py-2 border-t border-th-edge">
                        <div className="text-[10px] text-th-muted uppercase tracking-wider mb-2 px-2">
                            {t('editor.library.currentMedia')}
                        </div>

                        <div className="bg-th-card rounded-lg overflow-hidden border border-th-edge hover:border-blue-500/50 transition-colors cursor-pointer group">
                            <div className="aspect-video bg-slate-900 relative overflow-hidden">
                                <video
                                    src={videoInfo.url}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    muted
                                    preload="metadata"
                                />
                                <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1 py-0.5 rounded font-mono">
                                    {formatTime(videoInfo.duration)}
                                </div>
                                <div className="absolute top-1 left-1">
                                    <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                </div>
                            </div>

                            <div className="p-2">
                                <div className="text-[11px] font-medium text-th-primary truncate">
                                    {videoInfo.name}
                                </div>
                                <div className="text-[10px] text-th-muted mt-0.5">
                                    {formatBytes(videoInfo.size)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 编辑统计 */}
                <div className="px-2 py-3 border-t border-th-edge mt-2">
                    <div className="text-[10px] text-th-muted uppercase tracking-wider mb-2 px-2">
                        {t('editor.library.editStats')}
                    </div>

                    <div className="space-y-1.5 px-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-th-secondary flex items-center gap-1.5">
                                <Film size={11} className="text-purple-500 dark:text-purple-400" />
                                {t('editor.library.segments')}
                            </span>
                            <span className="text-th-primary font-mono">{segmentCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-th-secondary flex items-center gap-1.5">
                                <Clock size={11} className="text-green-600 dark:text-green-400" />
                                {t('editor.library.selectedDuration')}
                            </span>
                            <span className="text-green-600 dark:text-green-400 font-mono">{formatTime(totalSelectedDuration)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 底部提示 */}
            <div className="px-3 py-2 border-t border-th-edge bg-th-card/50 text-[10px] text-th-muted">
                {t('editor.library.hint')}
            </div>
        </div>
    );
};
