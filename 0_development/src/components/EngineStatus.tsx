import React, { useEffect, useState } from 'react';
import { exportService, EngineStatus as EngineStatusType } from '../services/exportService';
import { Loader2, CheckCircle, XCircle, Cpu } from 'lucide-react';
import { useI18n } from '../i18n';

interface EngineStatusProps {
    className?: string;
}

/**
 * Shows the export engine status (WebCodecs detection).
 * Triggers engine initialization on mount.
 */
export const EngineStatus: React.FC<EngineStatusProps> = ({ className = '' }) => {
    const [status, setStatus] = useState<EngineStatusType>('idle');
    const { t } = useI18n();

    useEffect(() => {
        exportService.onStatusChange(setStatus);
        exportService.init().catch(console.error);
        return () => { exportService.offStatusChange(setStatus); };
    }, []);

    const getStatusUI = () => {
        switch (status) {
            case 'idle':
                return {
                    icon: <Cpu size={14} className="text-th-secondary" />,
                    text: t('engine.idle'),
                    color: 'text-th-secondary bg-th-card border-th-divider',
                };
            case 'loading':
                return {
                    icon: <Loader2 size={14} className="text-amber-600 dark:text-amber-400 animate-spin" />,
                    text: t('engine.loading'),
                    color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-500/30',
                };
            case 'ready':
                return {
                    icon: <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />,
                    text: t('engine.ready.webcodecs'),
                    color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-500/30',
                };
            case 'error':
                return {
                    icon: <XCircle size={14} className="text-red-600 dark:text-red-400" />,
                    text: t('engine.error'),
                    color: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-500/30',
                };
        }
    };

    const ui = getStatusUI();

    return (
        <div className={`flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-mono border ${ui.color} ${className}`}>
            {ui.icon}
            <span>{ui.text}</span>
        </div>
    );
};
