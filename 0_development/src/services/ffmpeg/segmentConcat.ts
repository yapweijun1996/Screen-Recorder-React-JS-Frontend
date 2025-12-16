import type { FFmpeg } from '@ffmpeg/ffmpeg';

// @ffmpeg/ffmpeg 目前不會從入口匯出 LogEvent 型別，這裡用最小 shape（只需要 message）。
type LogEventLike = { message: string };

/**
 * Normalize segments to a safe, stable shape:
 * - sorts by start time
 * - removes invalid or zero-length segments
 */
export const normalizeSegments = (segments: Array<{ start: number; end: number }>) => {
    return segments
        .map((s) => ({ start: Number(s.start), end: Number(s.end) }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
        .sort((a, b) => a.start - b.start);
};

/**
 * Detect whether input contains an audio stream.
 * - Uses FFmpeg itself (no ffprobe in wasm builds)
 * - Avoids brittle log parsing
 */
export const detectHasAudio = async (ffmpeg: FFmpeg, inputName: string) => {
    const logs: string[] = [];
    const onLog = ({ message }: LogEventLike) => logs.push(message);

    ffmpeg.on('log', onLog);
    try {
        // 在 wasm 版中，任意「失敗的 exec」都可能導致 Aborted()，所以用「一定成功」的命令探測：
        // - 只 map 視訊到 null 輸出（永遠存在）
        // - 從輸入資訊的 log 判斷是否有 Audio stream
        const rc = await ffmpeg.exec(['-i', inputName, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']);
        if (rc !== 0) return false;
        return logs.some((line) => /\bAudio:\s/.test(line));
    } catch {
        // 若 FFmpeg exec 途中被中止，保守回傳 false（走 video-only 路徑最安全）
        return false;
    } finally {
        ffmpeg.off('log', onLog);
    }

};

/**
 * Build a filter_complex graph for multi-segment trimming + concat.
 * Output labels:
 * - video: [vout]
 * - audio: [aout] (only when hasAudio)
 */
export const buildConcatFilterGraph = (args: {
    segments: Array<{ start: number; end: number }>;
    hasAudio: boolean;
    videoFilter: string;
}) => {
    const { segments, hasAudio, videoFilter } = args;
    const n = segments.length;

    const lines: string[] = [];

    for (let i = 0; i < n; i++) {
        const seg = segments[i];
        const start = seg.start.toFixed(3);
        const end = seg.end.toFixed(3);

        // Video segment
        lines.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);

        // Audio segment (if present)
        if (hasAudio) {
            lines.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
        }
    }

    const concatInputs = hasAudio
        ? segments.map((_, i) => `[v${i}][a${i}]`).join('')
        : segments.map((_, i) => `[v${i}]`).join('');

    if (hasAudio) {
        lines.push(`${concatInputs}concat=n=${n}:v=1:a=1[vcat][aout]`);
    } else {
        lines.push(`${concatInputs}concat=n=${n}:v=1:a=0[vcat]`);
    }

    // Apply scaling/fps AFTER concat so settings are consistent across segments
    lines.push(`[vcat]${videoFilter}[vout]`);

    return {
        filterGraph: lines.join(';'),
        videoOut: 'vout',
        audioOut: hasAudio ? 'aout' : null,
    };
};
