import {
    ServiceWorkerUpdates,
    type UpdateAvailableHandler,
    type UpdateCheckResult,
} from './services/serviceWorkerUpdates';
import { taskActivity } from './services/taskActivity';

let updates: ServiceWorkerUpdates | null = null;

export const APP_BUILD_VERSION = __SCREENCLIP_BUILD_VERSION__;
export type { UpdateAvailableHandler, UpdateCheckResult };

export function applyUpdate(): boolean {
    return updates?.applyUpdate() ?? false;
}

export function setupServiceWorker(onUpdateAvailable: UpdateAvailableHandler): () => void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => {};
    const current = new ServiceWorkerUpdates(
        navigator.serviceWorker,
        taskActivity,
        onUpdateAvailable,
        () => location.reload(),
        () => APP_BUILD_VERSION,
    );
    updates = current;
    void current.start(new URL(`${import.meta.env.BASE_URL}sw.js`, location.href).href);
    return () => {
        current.dispose();
        if (updates === current) updates = null;
    };
}

export function checkForUpdates(): Promise<UpdateCheckResult> {
    return updates?.checkForUpdates() ?? Promise.resolve({
        status: 'no-worker',
        currentVersion: APP_BUILD_VERSION,
        waitingVersion: null,
        installingVersion: null,
    });
}
