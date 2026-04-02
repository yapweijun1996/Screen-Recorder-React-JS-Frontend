import React, { useEffect, useState } from 'react';
import { ffmpegService, FFmpegLoadStatus } from '../services/ffmpegService';
import { Loader2, CheckCircle, XCircle, Cpu } from 'lucide-react';
import { useI18n } from '../i18n';

interface FFmpegStatusProps {
    className?: string;
}

/**
 * FFmpegStatus - Shows the loading status of FFmpeg WASM engine
 * Triggers preload on mount
 */
export const FFmpegStatus: React.FC<FFmpegStatusProps> = ({ className = '' }) => {
    const [status, setStatus] = useState<FFmpegLoadStatus>('idle');
    const { t } = useI18n();

    useEffect(() => {
        // Subscribe to status changes
        ffmpegService.onStatusChange(setStatus);

        // Start preloading immediately
        ffmpegService.preload().catch(console.error);

        return () => {
            ffmpegService.offStatusChange(setStatus);
        };
    }, []);

    const getStatusUI = () => {
        switch (status) {
            case 'idle':
                return {
                    icon: <Cpu size={14} className="text-th-secondary" />,
                    text: t('ffmpeg.idle'),
                    color: 'text-th-secondary bg-th-card border-th-divider'
                };
            case 'loading':
                return {
                    icon: <Loader2 size={14} className="text-amber-600 dark:text-amber-400 animate-spin" />,
                    text: t('ffmpeg.loading'),
                    color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-500/30'
                };
            case 'loaded':
                return {
                    icon: <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />,
                    text: t('ffmpeg.loaded'),
                    color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-500/30'
                };
            case 'error':
                return {
                    icon: <XCircle size={14} className="text-red-600 dark:text-red-400" />,
                    text: t('ffmpeg.error'),
                    color: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-500/30'
                };
        }
    };

    const ui = getStatusUI();

    return (
        <div className={`flex items-center gap-1.5 h-8 px-2 rounded text-xs font-mono border ${ui.color} ${className}`}>
            {ui.icon}
            <span>{ui.text}</span>
        </div>
    );
};
