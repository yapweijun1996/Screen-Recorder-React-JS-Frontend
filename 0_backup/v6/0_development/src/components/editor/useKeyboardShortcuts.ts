import { useEffect, useCallback, useRef } from 'react';

interface KeyboardShortcutsConfig {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    onSplitAtPlayhead?: () => void;
    onUndo?: () => void;
    onDeleteSelected?: () => void;
    maxDuration: number;
    segmentStart: number;
    segmentEnd: number;
}

/**
 * Final Cut Pro 风格的键盘快捷键
 * 
 * 播放控制:
 * - Space: 播放/暂停
 * - K: 暂停
 * - L: 正向播放（多次按加速）
 * - J: 反向播放（多次按加速）
 * 
 * 导航:
 * - ← / →: 帧步进（±1帧，约 1/30 秒）
 * - Shift + ← / →: 大步跳转（±1秒）
 * - Home / End: 跳到开头/结尾
 * 
 * 编辑:
 * - B / Cmd+B: 在播放头位置剪切（Blade）
 * - Delete / Backspace: 删除选中片段
 * - Cmd+Z: 撤销
 */
export function useKeyboardShortcuts({
    videoRef,
    isPlaying,
    onTogglePlay,
    onSeek,
    onSplitAtPlayhead,
    onUndo,
    onDeleteSelected,
    maxDuration,
    segmentStart,
    segmentEnd,
}: KeyboardShortcutsConfig) {
    const playbackRateRef = useRef(1);
    const jklModeRef = useRef<'forward' | 'backward' | 'paused'>('paused');

    const getCurrentTime = useCallback(() => {
        return videoRef.current?.currentTime ?? 0;
    }, [videoRef]);

    const setPlaybackRate = useCallback((rate: number) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = Math.abs(rate);
            playbackRateRef.current = rate;
        }
    }, [videoRef]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // 忽略在输入框中的按键
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLSelectElement
        ) {
            return;
        }

        const video = videoRef.current;
        if (!video) return;

        const currentTime = getCurrentTime();
        const frameStep = 1 / 30; // 约一帧
        const bigStep = 1; // 1秒

        switch (e.code) {
            // ========== 播放控制 ==========
            case 'Space':
                e.preventDefault();
                onTogglePlay();
                break;

            case 'KeyK':
                // K = 暂停
                e.preventDefault();
                if (isPlaying) {
                    video.pause();
                }
                jklModeRef.current = 'paused';
                setPlaybackRate(1);
                break;

            case 'KeyL':
                // L = 正向播放，多次按加速
                e.preventDefault();
                if (jklModeRef.current === 'forward') {
                    // 加速：1x → 2x → 4x → 8x
                    const newRate = Math.min(playbackRateRef.current * 2, 8);
                    setPlaybackRate(newRate);
                } else {
                    jklModeRef.current = 'forward';
                    setPlaybackRate(1);
                }
                if (video.paused) {
                    video.play().catch(() => { });
                }
                break;

            case 'KeyJ':
                // J = 反向播放（模拟，因为 video 不支持反向）
                // 这里用快速倒退来模拟
                e.preventDefault();
                if (jklModeRef.current === 'backward') {
                    // 实际上浏览器不支持反向播放，这里用跳帧模拟
                    onSeek(Math.max(0, currentTime - 0.5));
                } else {
                    jklModeRef.current = 'backward';
                    onSeek(Math.max(0, currentTime - 0.1));
                }
                break;

            // ========== 帧步进 ==========
            case 'ArrowLeft':
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift + ← = 大步后退
                    onSeek(Math.max(segmentStart, currentTime - bigStep));
                } else {
                    // ← = 帧后退
                    onSeek(Math.max(segmentStart, currentTime - frameStep));
                }
                break;

            case 'ArrowRight':
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift + → = 大步前进
                    onSeek(Math.min(segmentEnd, currentTime + bigStep));
                } else {
                    // → = 帧前进
                    onSeek(Math.min(segmentEnd, currentTime + frameStep));
                }
                break;

            // ========== 跳转 ==========
            case 'Home':
                e.preventDefault();
                onSeek(segmentStart);
                break;

            case 'End':
                e.preventDefault();
                onSeek(segmentEnd);
                break;

            // ========== 编辑操作 ==========
            case 'KeyB':
                // B 或 Cmd+B = Blade（剪切）
                if (e.metaKey || e.ctrlKey || !e.shiftKey) {
                    e.preventDefault();
                    onSplitAtPlayhead?.();
                }
                break;

            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                onDeleteSelected?.();
                break;

            case 'KeyZ':
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    onUndo?.();
                }
                break;

            default:
                break;
        }
    }, [
        videoRef,
        isPlaying,
        onTogglePlay,
        onSeek,
        onSplitAtPlayhead,
        onUndo,
        onDeleteSelected,
        getCurrentTime,
        setPlaybackRate,
        segmentStart,
        segmentEnd,
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    return {
        currentPlaybackRate: playbackRateRef.current,
    };
}
