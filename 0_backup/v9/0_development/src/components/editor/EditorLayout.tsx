import React, { useState, useCallback } from 'react';
import { ResizeHandle } from './ResizeHandle';

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

// 面板尺寸约束 (px)
const LIBRARY_MIN_WIDTH = 180;
const LIBRARY_MAX_WIDTH = 400;
const LIBRARY_DEFAULT_WIDTH = 224; // 相当于 w-56

const INSPECTOR_MIN_WIDTH = 200;
const INSPECTOR_MAX_WIDTH = 450;
const INSPECTOR_DEFAULT_WIDTH = 256; // 相当于 w-64

const TIMELINE_MIN_HEIGHT = 120;
const TIMELINE_MAX_HEIGHT = 400;
const TIMELINE_DEFAULT_HEIGHT = 200;

/**
 * Final Cut Pro 风格的编辑器布局
 * 支持可拖拽调整面板大小
 * 增强毛玻璃效果和视觉层次
 */
export const EditorLayout: React.FC<EditorLayoutProps> = ({
    libraryPanel,
    viewerPanel,
    inspectorPanel,
    timelinePanel,
    topBar,
}) => {
    const [libraryWidth, setLibraryWidth] = useState(LIBRARY_DEFAULT_WIDTH);
    const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
    const [timelineHeight, setTimelineHeight] = useState(TIMELINE_DEFAULT_HEIGHT);

    const handleLibraryResize = useCallback((delta: number) => {
        setLibraryWidth((prev) => Math.max(LIBRARY_MIN_WIDTH, Math.min(LIBRARY_MAX_WIDTH, prev + delta)));
    }, []);

    const handleInspectorResize = useCallback((delta: number) => {
        setInspectorWidth((prev) => Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, prev - delta)));
    }, []);

    const handleTimelineResize = useCallback((delta: number) => {
        setTimelineHeight((prev) => Math.max(TIMELINE_MIN_HEIGHT, Math.min(TIMELINE_MAX_HEIGHT, prev - delta)));
    }, []);

    return (
        <div className="fcp-editor-layout flex-1 min-h-0 flex flex-col bg-th-base dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900 overflow-hidden">
            {/* Top Bar (optional) */}
            {topBar && (
                <div className="fcp-topbar flex-shrink-0 border-b border-th-edge bg-th-surface backdrop-blur-sm">
                    {topBar}
                </div>
            )}

            {/* Main Content Area - 三栏布局 */}
            <div className="fcp-main flex-1 flex min-h-0 overflow-hidden">
                {/* 左侧：素材库 (Library/Browser) */}
                {libraryPanel && (
                    <>
                        <aside
                            className="
                                fcp-library flex-shrink-0 overflow-y-auto
                                bg-th-surface dark:bg-slate-900/95
                                border-r border-th-edge
                            "
                            style={{ width: libraryWidth }}
                        >
                            {libraryPanel}
                        </aside>
                        <ResizeHandle
                            direction="horizontal"
                            onResize={handleLibraryResize}
                        />
                    </>
                )}

                {/* 中央：监视器 (Viewer) */}
                <main className="fcp-viewer flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950/80">
                    <div className="flex-1 min-h-0 overflow-hidden p-3">
                        {viewerPanel}
                    </div>
                </main>

                {/* Inspector 分割线 */}
                <ResizeHandle
                    direction="horizontal"
                    onResize={handleInspectorResize}
                />

                {/* 右侧：检查器 (Inspector) */}
                <aside
                    className="
                        fcp-inspector flex-shrink-0 overflow-y-auto
                        bg-th-surface dark:bg-slate-900/95
                        border-l border-th-edge
                    "
                    style={{ width: inspectorWidth }}
                >
                    {inspectorPanel}
                </aside>
            </div>

            {/* Timeline 分割线 */}
            <ResizeHandle
                direction="vertical"
                onResize={handleTimelineResize}
            />

            {/* 底部：时间轴 (Timeline) */}
            <div
                className="
                    fcp-timeline flex-shrink-0
                    bg-th-surface dark:bg-gradient-to-t dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80
                    border-t border-th-edge
                "
                style={{ height: timelineHeight }}
            >
                {timelinePanel}
            </div>
        </div>
    );
};
