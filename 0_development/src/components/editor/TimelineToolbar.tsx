import React, { useState, useRef, useEffect } from 'react';
import { MousePointer2, Scissors, Hand, ZoomIn, ZoomOut, RotateCcw, ChevronDown, Maximize2 } from 'lucide-react';
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
 * 响应式设计：
 * - 大屏：完整显示所有工具
 * - 中屏：隐藏工具标签，只显示图标
 * - 小屏：折叠为下拉菜单
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
    const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsToolMenuOpen(false);
            }
        };
        if (isToolMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isToolMenuOpen]);

    const tools: Array<{
        id: TimelineToolMode;
        icon: React.ReactNode;
        label: string;
        shortcut: string;
        color: string;
    }> = [
            {
                id: 'select',
                icon: <MousePointer2 size={14} />,
                label: t('editor.tools.select') || 'Select',
                shortcut: 'A',
                color: 'indigo',
            },
            {
                id: 'blade',
                icon: <Scissors size={14} />,
                label: t('editor.tools.blade') || 'Blade',
                shortcut: 'B',
                color: 'amber',
            },
            {
                id: 'hand',
                icon: <Hand size={14} />,
                label: t('editor.tools.hand') || 'Hand',
                shortcut: 'H',
                color: 'cyan',
            },
        ];

    const activeToolData = tools.find(t => t.id === activeTool) || tools[0];

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            {/* 工具选择区 - 大屏显示全部，小屏显示当前+下拉 */}

            {/* 小屏：下拉菜单模式 */}
            <div className="relative sm:hidden" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setIsToolMenuOpen(!isToolMenuOpen)}
                    className={`
                        flex items-center gap-1.5 px-2 py-1.5 rounded-md
                        bg-slate-800/80 border border-slate-700/50
                        text-white text-xs font-medium
                        hover:bg-slate-700/80 transition-all
                    `}
                >
                    {activeToolData.icon}
                    <ChevronDown size={12} className={`transition-transform ${isToolMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* 下拉菜单 */}
                {isToolMenuOpen && (
                    <div className="
                        absolute top-full left-0 mt-1 z-50
                        bg-slate-900/95 backdrop-blur-md
                        border border-slate-700/50 rounded-lg
                        shadow-xl shadow-black/30
                        py-1 min-w-[120px]
                    ">
                        {tools.map((tool) => (
                            <button
                                key={tool.id}
                                type="button"
                                onClick={() => {
                                    onToolChange(tool.id);
                                    setIsToolMenuOpen(false);
                                }}
                                className={`
                                    w-full flex items-center gap-2 px-3 py-2 text-xs
                                    transition-all
                                    ${activeTool === tool.id
                                        ? 'bg-indigo-600/30 text-indigo-300'
                                        : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                                    }
                                `}
                            >
                                {tool.icon}
                                <span>{tool.label}</span>
                                <kbd className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-1 rounded">
                                    {tool.shortcut}
                                </kbd>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 中/大屏：图标按钮组 */}
            <div className="hidden sm:flex items-center gap-0.5 bg-slate-900/60 rounded-lg p-0.5 border border-slate-700/50">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        type="button"
                        onClick={() => onToolChange(tool.id)}
                        className={`
                            relative px-2 py-1.5 rounded-md transition-all
                            group flex items-center gap-1
                            ${activeTool === tool.id
                                ? tool.id === 'blade'
                                    ? 'bg-amber-600/80 text-white shadow-lg shadow-amber-500/20'
                                    : tool.id === 'hand'
                                        ? 'bg-cyan-600/80 text-white shadow-lg shadow-cyan-500/20'
                                        : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }
                        `}
                        title={`${tool.label} (${tool.shortcut})`}
                    >
                        {tool.icon}
                        {/* 大屏显示标签 */}
                        <span className="hidden lg:inline text-[10px] font-medium">{tool.label}</span>

                        {/* Tooltip */}
                        <span className="
                            hidden group-hover:block lg:group-hover:hidden
                            absolute -bottom-8 left-1/2 -translate-x-1/2 
                            bg-slate-900/95 text-[10px] text-white 
                            px-2 py-1 rounded shadow-lg 
                            border border-slate-700 
                            whitespace-nowrap z-50
                            backdrop-blur-sm
                        ">
                            {tool.label}
                            <kbd className="ml-1 px-1 py-0.5 bg-slate-800 rounded text-slate-300">{tool.shortcut}</kbd>
                        </span>
                    </button>
                ))}
            </div>

            {/* 分隔线 */}
            <div className="hidden sm:block w-px h-5 bg-slate-700/50" />

            {/* 缩放控制区 */}
            <div className="flex items-center gap-0.5 bg-slate-900/60 rounded-lg p-0.5 border border-slate-700/50">
                <button
                    type="button"
                    onClick={onZoomOut}
                    disabled={zoomLevel <= 0.5}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('editor.timeline.zoomOut') || 'Zoom Out (-)'}
                >
                    <ZoomOut size={13} />
                </button>

                {/* 缩放百分比 - 大屏显示，小屏隐藏 */}
                <button
                    type="button"
                    onClick={onZoomReset}
                    className="hidden xs:flex px-1.5 py-1 rounded-md text-[10px] font-mono text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all min-w-[40px] justify-center items-center gap-0.5"
                    title={t('editor.timeline.zoomReset') || 'Reset Zoom'}
                >
                    <Maximize2 size={10} className="opacity-50" />
                    <span>{Math.round(zoomLevel * 100)}%</span>
                </button>

                <button
                    type="button"
                    onClick={onZoomIn}
                    disabled={zoomLevel >= 10}
                    className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('editor.timeline.zoomIn') || 'Zoom In (+)'}
                >
                    <ZoomIn size={13} />
                </button>
            </div>
        </div>
    );
};

