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
    }, []);

    const getStatusUI = () => {
        switch (status) {
            case 'idle':
                return {
                    icon: <Cpu size={14} className="text-slate-400" />,
                    text: t('ffmpeg.idle'),
                    color: 'text-slate-400 bg-slate-800'
                };
            case 'loading':
                return {
                    icon: <Loader2 size={14} className="text-amber-400 animate-spin" />,
                    text: t('ffmpeg.loading'),
                    color: 'text-amber-400 bg-amber-900/30 border-amber-500/30'
                };
            case 'loaded':
                return {
                    icon: <CheckCircle size={14} className="text-emerald-400" />,
                    text: t('ffmpeg.loaded'),
                    color: 'text-emerald-400 bg-emerald-900/30 border-emerald-500/30'
                };
            case 'error':
                return {
                    icon: <XCircle size={14} className="text-red-400" />,
                    text: t('ffmpeg.error'),
                    color: 'text-red-400 bg-red-900/30 border-red-500/30'
                };
        }
    };

    const ui = getStatusUI();

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono border ${ui.color} ${className}`}>
            {ui.icon}
            <span>{ui.text}</span>
        </div>
    );
};
