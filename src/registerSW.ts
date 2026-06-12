import { registerSW } from 'virtual:pwa-register';

const HOUR = 60 * 60 * 1000;

// Held so applyUpdate() can trigger skipWaiting + reload from anywhere in the app.
let _updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function applyUpdate(): void {
    _updateSW?.(true);
}

export function setupServiceWorker(onUpdateAvailable: () => void): void {
    _updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            onUpdateAvailable();
        },
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;

            setInterval(() => {
                registration.update().catch(() => {});
            }, HOUR);

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update().catch(() => {});
                }
            });
        },
    });
}
