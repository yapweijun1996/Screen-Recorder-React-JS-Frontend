export const MEDIA_WAIT_TIMEOUT_MS = 30_000;

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

// Native decode/flush APIs cannot be stopped directly. Reject our wait promptly,
// while keeping a rejection handler attached to their eventual completion.
export function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const onAbort = () => finish(new DOMException('Export cancelled', 'AbortError'));
        const finish = (error?: unknown, value?: T) => {
            signal?.removeEventListener('abort', onAbort);
            if (error) reject(error); else resolve(value as T);
        };
        operation.then(value => finish(undefined, value), error => finish(error));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}

interface MediaWaitOptions {
    signal?: AbortSignal;
    ready?: () => boolean;
    action?: () => void;
    timeoutMs?: number;
}

export function waitForMedia(
    video: HTMLVideoElement, event: string,
    { signal, ready, action, timeoutMs = MEDIA_WAIT_TIMEOUT_MS }: MediaWaitOptions = {},
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener(event, onReady);
            video.removeEventListener('error', onError);
            signal?.removeEventListener('abort', onAbort);
        };
        const settle = (error?: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error); else resolve();
        };
        const onReady = () => settle();
        const onError = () => settle(new Error(`Video failed while waiting for ${event}`));
        const onAbort = () => settle(new DOMException('Export cancelled', 'AbortError'));
        const timer = setTimeout(() => settle(new Error(`Video timed out waiting for ${event}`)), timeoutMs);
        video.addEventListener(event, onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { onAbort(); return; }
        if (video.error) { onError(); return; }
        // Attach listeners before changing src/currentTime to catch cached or
        // synchronous events, then check whether an event is needed at all.
        try {
            action?.();
            if (ready?.()) onReady();
        } catch (error) { settle(error); }
    });
}

export function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
    const ready = () => !video.seeking && Math.abs(video.currentTime - time) < 0.000001;
    throwIfAborted(signal);
    if (ready()) return Promise.resolve();
    return waitForMedia(video, 'seeked', { signal, ready, action: () => { video.currentTime = time; } });
}

export function releaseVideo(video: HTMLVideoElement, url: string) {
    try { video.pause(); } catch { /* A failed pause must not retain the URL. */ }
    try {
        video.removeAttribute('src');
        video.load();
    } catch { /* A detached element may reject cleanup; still release the URL. */ }
    finally { URL.revokeObjectURL(url); }
}
