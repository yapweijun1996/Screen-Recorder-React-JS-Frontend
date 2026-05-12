import { registerSW } from 'virtual:pwa-register';

const HOUR = 60 * 60 * 1000;

export function setupServiceWorker(): void {
    const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            updateSW(true);
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
