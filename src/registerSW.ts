import { ServiceWorkerUpdates } from './services/serviceWorkerUpdates';
import { taskActivity } from './services/taskActivity';

let updates: ServiceWorkerUpdates | null = null;

export function applyUpdate(): boolean {
    return updates?.applyUpdate() ?? false;
}

export function setupServiceWorker(onUpdateAvailable: () => void): () => void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => {};
    const current = new ServiceWorkerUpdates(navigator.serviceWorker, taskActivity, onUpdateAvailable, () => location.reload());
    updates = current;
    void current.start(new URL(`${import.meta.env.BASE_URL}sw.js`, location.href).href);
    return () => {
        current.dispose();
        if (updates === current) updates = null;
    };
}
