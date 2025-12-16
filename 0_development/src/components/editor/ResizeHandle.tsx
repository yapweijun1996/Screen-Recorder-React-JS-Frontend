import React, { useCallback, useEffect, useState } from 'react';

interface ResizeHandleProps {
    /** 拖拽方向 */
    direction: 'horizontal' | 'vertical';
    /** 当拖拽时的回调，返回位移量 (px) */
    onResize: (delta: number) => void;
    /** 拖拽结束的回调 */
    onResizeEnd?: () => void;
    /** 自定义样式类 */
    className?: string;
}

/**
 * 可拖拽的分割线组件
 * 用于调整面板大小
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
    direction,
    onResize,
    onResizeEnd,
    className = '',
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setStartPos(direction === 'horizontal' ? e.clientX : e.clientY);
    }, [direction]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
        const delta = currentPos - startPos;
        setStartPos(currentPos);
        onResize(delta);
    }, [isDragging, direction, startPos, onResize]);

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            onResizeEnd?.();
        }
    }, [isDragging, onResizeEnd]);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            // 防止选中文字
            document.body.style.userSelect = 'none';
            document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isDragging, handleMouseMove, handleMouseUp, direction]);

    const isHorizontal = direction === 'horizontal';

    return (
        <div
            className={`
                group
                ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
                ${isHorizontal ? 'hover:w-1.5' : 'hover:h-1.5'}
                bg-slate-800/50
                hover:bg-blue-500/50
                active:bg-blue-500/70
                transition-all duration-150
                flex-shrink-0
                relative
                ${isDragging ? 'bg-blue-500/70' : ''}
                ${className}
            `}
            onMouseDown={handleMouseDown}
        >
            {/* 拖拽指示器 */}
            <div
                className={`
                    absolute
                    ${isHorizontal ? 'inset-y-0 left-1/2 -translate-x-1/2 w-0.5' : 'inset-x-0 top-1/2 -translate-y-1/2 h-0.5'}
                    bg-slate-600
                    group-hover:bg-blue-400
                    ${isDragging ? 'bg-blue-400' : ''}
                    transition-colors
                `}
            />

            {/* 中间的抓取点 */}
            <div
                className={`
                    absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    ${isHorizontal ? 'w-1 h-8' : 'w-8 h-1'}
                    flex items-center justify-center gap-0.5
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                `}
            >
                {isHorizontal ? (
                    <>
                        <div className="w-0.5 h-4 bg-blue-400 rounded-full" />
                        <div className="w-0.5 h-4 bg-blue-400 rounded-full" />
                    </>
                ) : (
                    <>
                        <div className="w-4 h-0.5 bg-blue-400 rounded-full" />
                        <div className="w-4 h-0.5 bg-blue-400 rounded-full" />
                    </>
                )}
            </div>
        </div>
    );
};
