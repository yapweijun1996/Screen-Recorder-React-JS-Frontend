import React from 'react';

interface EditorLayoutProps {
    /** 左侧素材库/浏览器面板 */
    libraryPanel?: React.ReactNode;
    /** 中央监视器/播放器区域 */
    viewerPanel: React.ReactNode;
    /** 右侧检查器/导出面板 */
    inspectorPanel: React.ReactNode;
    /** 底部时间轴 */
    timelinePanel: React.ReactNode;
    /** 顶部工具栏 (可选，如果有header放在外部) */
    topBar?: React.ReactNode;
}

/**
 * Final Cut Pro 风格的编辑器布局
 * 
 * 布局结构：
 * ┌──────────────────────────────────────────────────┐
 * │                    Top Bar                        │
 * ├────────┬──────────────────────────┬───────────────┤
 * │        │                          │               │
 * │Library │        Viewer            │   Inspector   │
 * │        │                          │               │
 * ├────────┴──────────────────────────┴───────────────┤
 * │                    Timeline                        │
 * └──────────────────────────────────────────────────┘
 */
export const EditorLayout: React.FC<EditorLayoutProps> = ({
    libraryPanel,
    viewerPanel,
    inspectorPanel,
    timelinePanel,
    topBar,
}) => {
    return (
        <div className="fcp-editor-layout h-[calc(100vh-64px)] flex flex-col bg-slate-950 overflow-hidden">
            {/* Top Bar (optional) */}
            {topBar && (
                <div className="fcp-topbar flex-shrink-0 border-b border-slate-800 bg-slate-900/80">
                    {topBar}
                </div>
            )}

            {/* Main Content Area - 三栏布局 */}
            <div className="fcp-main flex-1 flex min-h-0 overflow-hidden">
                {/* 左侧：素材库 (Library/Browser) */}
                {libraryPanel && (
                    <aside className="fcp-library w-56 xl:w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
                        {libraryPanel}
                    </aside>
                )}

                {/* 中央：监视器 (Viewer) */}
                <main className="fcp-viewer flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-950">
                    <div className="flex-1 min-h-0 overflow-hidden p-2">
                        {viewerPanel}
                    </div>
                </main>

                {/* 右侧：检查器 (Inspector) */}
                <aside className="fcp-inspector w-64 xl:w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/50 overflow-y-auto">
                    {inspectorPanel}
                </aside>
            </div>

            {/* 底部：时间轴 (Timeline) */}
            <div className="fcp-timeline flex-shrink-0 border-t border-slate-800 bg-slate-950">
                {timelinePanel}
            </div>
        </div>
    );
};
