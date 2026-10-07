import type { RefObject } from 'react';
import type { TrimRange, VideoMetadata } from '../../types';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

interface PlaybackArgs {
    videoRef: RefObject<HTMLVideoElement | null>;
    videoMetadata: VideoMetadata;
    currentTime: number;
    isPlaying: boolean;
    setIsPlaying: (value: boolean) => void;
    setCurrentTime: (value: number) => void;
    playbackError: string | null;
    setPlaybackError: (value: string | null) => void;
    safeSegments: TrimRange[];
    selectedSegment: TrimRange;
    selectedIndex: number;
    previewIndex: number | null;
    setPreviewIndex: (value: number | null) => void;
    setSelectedIndexDirect: (value: number) => void;
    splitSelectedAt: (value: number) => void;
    undo: () => void;
    deleteSelectedSegment: () => void;
    syncDurationIfUntouched: (value: number) => void;
    maxDuration: number;
    t: (key: string) => string;
}

export const useEditorPlayback = ({
    videoRef,
    videoMetadata,
    isPlaying, currentTime,
    setIsPlaying,
    setCurrentTime,
    playbackError,
    setPlaybackError,
    safeSegments,
    selectedSegment,
    selectedIndex,
    previewIndex,
    setPreviewIndex,
    setSelectedIndexDirect,
    splitSelectedAt,
    undo,
    deleteSelectedSegment,
    syncDurationIfUntouched,
    maxDuration,
    t
}: PlaybackArgs) => {
    // Keep keyboard and player actions on the same playback state.
    useKeyboardShortcuts({
        videoRef,
        isPlaying,
        onTogglePlay: () => {
            if (!videoRef.current || playbackError) return;
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play().catch(err =>
                    console.warn('Editor: keyboard toggle play failed', err)
                );
            }
            setIsPlaying(!isPlaying);
        },
        onSeek: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
                setCurrentTime(time);
            }
        },
        onSplitAtPlayhead: () => splitSelectedAt(currentTime),
        onUndo: undo,
        onDeleteSelected: () => {
            // After deletion, seek to the new selected segment's start
            const newIdx = Math.max(0, selectedIndex - 1);
            const remainingSegments = safeSegments.filter((_, i) => i !== selectedIndex);
            if (remainingSegments.length > 0 && videoRef.current) {
                const target = remainingSegments[Math.min(newIdx, remainingSegments.length - 1)];
                videoRef.current.currentTime = target.start;
                setCurrentTime(target.start);
            }
            deleteSelectedSegment();
        },
        maxDuration,
        segmentStart: selectedSegment.start,
        segmentEnd: selectedSegment.end,
    });

    // Sync Video Time
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const curr = videoRef.current.currentTime;
            setCurrentTime(curr);

            // Preview retained segments consecutively, skipping removed ranges.
            if (previewIndex !== null) {
                const seg = safeSegments[previewIndex];
                if (seg && curr >= seg.end) {
                    const next = previewIndex + 1;
                    if (next < safeSegments.length) {
                        setPreviewIndex(next);
                        setSelectedIndexDirect(next);
                        videoRef.current.currentTime = safeSegments[next].start;
                    } else {
                        setPreviewIndex(null);
                        videoRef.current.pause();
                        setIsPlaying(false);
                    }
                }
                return;
            }

            // Regular preview loops within the currently selected segment.
            if (curr >= selectedSegment.end) {
                videoRef.current.currentTime = selectedSegment.start;
            }
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            // Restore the retained playhead after the editor remounts.
            videoRef.current.currentTime = Math.min(currentTime, maxDuration);
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur) && dur > 0) {
                setPlaybackError(null);
                syncDurationIfUntouched(dur);
            } else if (Number.isFinite(dur) && dur <= 0) {
                setPlaybackError(t('editor.playback.durationZero'));
            } else {
                // WebM from MediaRecorder reports Infinity duration;
                // fall back to the duration measured via timer
                if (Number.isFinite(videoMetadata.duration) && videoMetadata.duration > 0) {
                    setPlaybackError(null);
                    syncDurationIfUntouched(videoMetadata.duration);
                } else {
                    setPlaybackError(t('editor.playback.readError'));
                }
            }
        }
    };

    const togglePlay = () => {
        if (!videoRef.current || playbackError) return;
        if (isPlaying) {
            videoRef.current.pause();
            setPreviewIndex(null);
        } else {
            if (videoRef.current.currentTime >= selectedSegment.end) {
                videoRef.current.currentTime = selectedSegment.start;
            }
            videoRef.current.play().catch(err =>
                console.warn('Editor: togglePlay play() failed', err)
            );
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const toggleFullscreen = () => {
        const target = videoRef.current;
        if (!target) return;
        if (!document.fullscreenElement) {
            target.requestFullscreen?.().catch((err) => console.warn('Enter fullscreen failed', err));
        } else {
            document.exitFullscreen?.().catch((err) => console.warn('Exit fullscreen failed', err));
        }
    };

    const previewEditedResult = () => {
        if (playbackError || !videoRef.current || safeSegments.length === 0) return;
        setPreviewIndex(0);
        setSelectedIndexDirect(0);
        videoRef.current.currentTime = safeSegments[0].start;
        videoRef.current.play().catch(err =>
            console.warn('Editor: previewEditedResult play() failed', err)
        );
    };

    return { handleTimeUpdate, handleLoadedMetadata, togglePlay, handleSeek, toggleFullscreen, previewEditedResult };
};
