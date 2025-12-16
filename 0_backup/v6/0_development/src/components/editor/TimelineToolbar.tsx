import React from 'react';
import { MousePointer2, Scissors, Hand, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';

export type TimelineToolMode = 'select' | 'blade' | 'hand';

interface TimelineToolbarProps {
    activeTool: TimelineToolMode;
    onToolChange: (tool: TimelineToolMode) => void;
    zoomLevel: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    className?: string;
}

/**
 * Final Cut Pro 风格的时间轴工具栏
 * - 选择工具 (A/V键)
 * - 剪刀工具 (B键)  
 * - 手型工具 (H键)
 * - 缩放控制
 */
export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
    activeTool,
    onToolChange,
    zoomLevel,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    className = '',
}) => {
    const { t } = useI18n();

    const tools: Array<{
        id: TimelineToolMode;
        icon: React.ReactNode;
        label: string;
        shortcut: string;
    }> = [
            {
                id: 'select',
                icon: <MousePointer2 size={16} />,
                label: t('editor.tools.select') || 'Select',
                shortcut: 'A',
            },
            {
                id: 'blade',
                icon: <Scissors size={16} />,
                label: t('editor.tools.blade') || 'Blade',
                shortcut: 'B',
            },
            {
                id: 'hand',
                icon: <Hand size={16} />,
                label: t('editor.tools.hand') || 'Hand',
                shortcut: 'H',
            },
        ];

    return (
        <div className={`flex items-center justify-between gap-2 ${className}`}>
            {/* 工具选择区 */}
            <div className="flex items-center gap-0.5 bg-slate-950/60 rounded-lg p-0.5 border border-slate-800">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        type="button"
                        onClick={() => onToolChange(tool.id)}
                        className={`
                            relative px-2.5 py-1.5 rounded-md transition-all
                            group flex items-center gap-1.5
                            ${activeTool === tool.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }
                        `}
                        title={`${tool.label} (${tool.shortcut})`}
                    >
                        {tool.icon}
                        {/* 悬浮提示 */}
                        <span className="hidden group-hover:block absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-[10px] text-white px-2 py-1 rounded shadow-lg border border-slate-700 whitespace-nowrap z-50">
                            {tool.label} <kbd className="ml-1 px-1 py-0.5 bg-slate-800 rounded text-slate-300">{tool.shortcut}</kbd>
                        </span>
                    </button>
                ))}
            </div>

            {/* 缩放控制区 */}
            <div className="flex items-center gap-1 bg-slate-950/60 rounded-lg p-0.5 border border-slate-800">
                <button
                    type="button"
                    onClick={onZoomOut}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                    title={t('editor.timeline.zoomOut') || 'Zoom Out (-)'}
                >
                    <ZoomOut size={14} />
                </button>

                <button
                    type="button"
                    onClick={onZoomReset}
                    className="px-2 py-1 rounded-md text-[10px] font-mono text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all min-w-[48px] text-center"
                    title={t('editor.timeline.zoomReset') || 'Reset Zoom'}
                >
                    {Math.round(zoomLevel * 100)}%
                </button>

                <button
                    type="button"
                    onClick={onZoomIn}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                    title={t('editor.timeline.zoomIn') || 'Zoom In (+)'}
                >
                    <ZoomIn size={14} />
                </button>
            </div>
        </div>
    );
};
