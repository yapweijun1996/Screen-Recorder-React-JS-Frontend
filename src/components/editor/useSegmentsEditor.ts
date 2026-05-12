import { useEffect, useMemo, useState } from 'react';
import type { TrimRange } from '../../types';

// UI 拖曳與分割的最小間距（避免太小導致難操作）
const MIN_HANDLE_GAP_SECONDS = 0.5;
// 刪除區間後，允許保留更短的片段（例如 0.4s 也應該可以被保留）
const MIN_KEEP_SEGMENT_SECONDS = 0.1;
// 刪除區間本身的最小長度（太短的刪除通常是誤觸）
const MIN_REMOVE_RANGE_SECONDS = 0.1;
const MAX_HISTORY = 20; // 避免記憶體無限制成長（一般剪輯撤銷 20 步已足夠）
const MERGE_EPSILON = 0.001; // 合併相鄰片段的容忍誤差（避免浮點造成 0.0000001 的縫）

interface UseSegmentsEditorArgs {
    initialDuration: number;
    maxDuration: number;
}

/**
 * 以「保留片段」的方式做剪輯：
 * - split：把目前片段切成兩段
 * - delete：刪掉其中一段，即可達成「刪除中間片段」
 */
export const useSegmentsEditor = ({ initialDuration, maxDuration }: UseSegmentsEditorArgs) => {
    const [segments, setSegments] = useState<TrimRange[]>([{ start: 0, end: initialDuration }]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [history, setHistory] = useState<TrimRange[][]>([]);

    // 當新影片載入（duration 變了），重置剪輯狀態
    useEffect(() => {
        if (Number.isFinite(initialDuration) && initialDuration > 0) {
            setSegments([{ start: 0, end: initialDuration }]);
            setSelectedIndex(0);
            setPreviewIndex(null);
            setHistory([]);
        }
    }, [initialDuration]);

    // 保護 index 不超界
    useEffect(() => {
        if (segments.length === 0) return;
        if (selectedIndex > segments.length - 1) setSelectedIndex(Math.max(0, segments.length - 1));
        if (previewIndex !== null && previewIndex > segments.length - 1) setPreviewIndex(null);
    }, [segments.length, selectedIndex, previewIndex]);

    const safeSegments = useMemo(() => {
        return segments.length > 0 ? segments : [{ start: 0, end: maxDuration }];
    }, [segments, maxDuration]);

    const selectedSegment = safeSegments[Math.min(selectedIndex, safeSegments.length - 1)];
    const activeIndex = previewIndex ?? selectedIndex;
    const activeSegment = safeSegments[Math.min(activeIndex, safeSegments.length - 1)];

    const totalSelectedDuration = useMemo(() => {
        return safeSegments.reduce((sum, s) => sum + Math.max(s.end - s.start, 0), 0);
    }, [safeSegments]);

    const pushHistory = (prev: TrimRange[]) => {
        setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), prev]);
    };

    const undo = () => {
        setHistory((h) => {
            const last = h[h.length - 1];
            if (!last) return h;
            setSegments(last);
            setSelectedIndex((idx) => Math.max(0, Math.min(idx, last.length - 1)));
            setPreviewIndex(null);
            return h.slice(0, -1);
        });
    };

    const selectIndex = (idx: number) => {
        setSelectedIndex(Math.max(0, Math.min(idx, safeSegments.length - 1)));
        setPreviewIndex(null);
    };

    const setSelectedIndexDirect = (idx: number) => {
        setSelectedIndex(Math.max(0, Math.min(idx, safeSegments.length - 1)));
    };

    const updateSelectedSegment = (start: number, end: number) => {
        setSegments((prev) => {
            if (prev.length === 0) return prev;
            pushHistory(prev);
            const idx = Math.min(selectedIndex, prev.length - 1);
            const prevEnd = idx > 0 ? prev[idx - 1].end : 0;
            const nextStart = idx < prev.length - 1 ? prev[idx + 1].start : maxDuration;

            const clampedStart = Math.max(prevEnd, Math.min(start, nextStart - MIN_HANDLE_GAP_SECONDS));
            const clampedEnd = Math.min(nextStart, Math.max(end, prevEnd + MIN_HANDLE_GAP_SECONDS));
            if (!Number.isFinite(clampedStart) || !Number.isFinite(clampedEnd) || clampedEnd <= clampedStart) return prev;

            return prev.map((s, i) => i === idx ? { start: clampedStart, end: clampedEnd } : s);
        });
    };

    const splitSelectedAt = (time: number) => {
        setSegments((prev) => {
            if (prev.length === 0) return prev;
            pushHistory(prev);
            const idx = Math.min(selectedIndex, prev.length - 1);
            const seg = prev[idx];
            if (!seg) return prev;

            const splitTime = Math.max(seg.start, Math.min(time, seg.end));
            if (splitTime - seg.start < MIN_HANDLE_GAP_SECONDS) return prev;
            if (seg.end - splitTime < MIN_HANDLE_GAP_SECONDS) return prev;

            const next = [
                ...prev.slice(0, idx),
                { start: seg.start, end: splitTime },
                { start: splitTime, end: seg.end },
                ...prev.slice(idx + 1),
            ];

            // split 後預設選到後半段，方便刪掉「中段」
            setSelectedIndex(idx + 1);
            return next;
        });
    };

    const deleteSelectedSegment = () => {
        setSegments((prev) => {
            if (prev.length <= 1) return [{ start: 0, end: maxDuration }];
            pushHistory(prev);
            const idx = Math.min(selectedIndex, prev.length - 1);
            const next = prev.filter((_, i) => i !== idx);
            setSelectedIndex(Math.max(0, idx - 1));
            return next;
        });
    };

    /**
     * 刪除某一段時間區間（最直覺的「刪掉中間」用法）
     * - 會把這個區間從現有片段中扣掉
     * - 自動合併相鄰片段並移除太短片段
     */
    const removeInterval = (start: number, end: number) => {
        const s = Math.min(start, end);
        const e = Math.max(start, end);
        if (!Number.isFinite(s) || !Number.isFinite(e) || e - s < MIN_REMOVE_RANGE_SECONDS) return;

        setSegments((prev) => {
            if (prev.length === 0) return prev;
            pushHistory(prev);

            const cut: TrimRange[] = [];
            for (const seg of prev) {
                // no overlap
                if (e <= seg.start || s >= seg.end) {
                    cut.push(seg);
                    continue;
                }
                // left remainder
                if (s > seg.start) cut.push({ start: seg.start, end: Math.min(s, seg.end) });
                // right remainder
                if (e < seg.end) cut.push({ start: Math.max(e, seg.start), end: seg.end });
            }

            const filtered = cut
                .map((seg) => ({
                    start: Math.max(0, Math.min(seg.start, maxDuration)),
                    end: Math.max(0, Math.min(seg.end, maxDuration)),
                }))
                // 刪除後允許更短的殘段存在（避免使用者覺得「刪除沒作用」）
                .filter((seg) => seg.end - seg.start >= MIN_KEEP_SEGMENT_SECONDS)
                .sort((a, b) => a.start - b.start);

            // Merge adjacent segments
            const merged: TrimRange[] = [];
            for (const seg of filtered) {
                const last = merged[merged.length - 1];
                if (!last) {
                    merged.push(seg);
                } else if (seg.start <= last.end + MERGE_EPSILON) {
                    last.end = Math.max(last.end, seg.end);
                } else {
                    merged.push(seg);
                }
            }

            if (merged.length === 0) {
                setSelectedIndex(0);
                return [{ start: 0, end: maxDuration }];
            }

            setSelectedIndex((idx) => Math.max(0, Math.min(idx, merged.length - 1)));
            setPreviewIndex(null);
            return merged;
        });
    };

    const resetSegments = () => {
        setSegments((prev) => {
            pushHistory(prev);
            return [{ start: 0, end: maxDuration }];
        });
        setSelectedIndex(0);
        setPreviewIndex(null);
    };

    /**
     * 若瀏覽器解析到的 duration 更準，且使用者還沒剪（只有一段、從 0 開始），則同步 end
     */
    const syncDurationIfUntouched = (duration: number) => {
        if (!Number.isFinite(duration) || duration <= 0) return;
        setSegments((prev) => {
            if (prev.length !== 1) return prev;
            if (prev[0].start !== 0) return prev;
            if (Math.abs(prev[0].end - duration) <= 1 && prev[0].end !== 0) return prev;
            return [{ start: 0, end: duration }];
        });
    };

    return {
        safeSegments,
        selectedSegment,
        activeSegment,
        selectedIndex,
        previewIndex,
        totalSelectedDuration,
        canUndo: history.length > 0,

        setPreviewIndex,
        selectIndex,
        setSelectedIndexDirect,
        updateSelectedSegment,
        splitSelectedAt,
        deleteSelectedSegment,
        removeInterval,
        undo,
        resetSegments,
        syncDurationIfUntouched,
    };
};
