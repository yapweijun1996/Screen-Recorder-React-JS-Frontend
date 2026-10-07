import { releaseVideo, throwIfAborted, waitForMedia } from './webcodecs/mediaWait';

export async function readRecordingDuration(blob: Blob, measuredDuration: number, signal?: AbortSignal) {
    throwIfAborted(signal);
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.preload = 'metadata';
    try {
        await waitForMedia(video, 'loadedmetadata', {
            signal, ready: () => video.readyState >= 1, action: () => { video.src = url; },
        });
        if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    } catch {
        throwIfAborted(signal);
        // Some MediaRecorder blobs have incomplete metadata. The recorder's
        // measured duration remains a valid fallback even after a load error.
    } finally { releaseVideo(video, url); }
    if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) throw new Error('Invalid recording duration');
    return measuredDuration;
}
