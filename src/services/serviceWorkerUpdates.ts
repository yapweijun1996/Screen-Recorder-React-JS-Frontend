import type { TaskActivity } from './taskActivity';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export class ServiceWorkerUpdates {
    private registration: ServiceWorkerRegistration | null = null;
    private cleanups: Array<() => void> = [];
    private disposed = false;
    private hadController: boolean;
    private reloadRequested = false;
    private controllerChanged = false;

    constructor(
        private container: ServiceWorkerContainer,
        private activity: TaskActivity,
        private notify: () => void,
        private reload: () => void,
    ) { this.hadController = !!container.controller; }

    async start(url: string) {
        if (this.disposed) return;
        const changed = () => {
            if (!this.hadController && !this.reloadRequested) { this.hadController = true; return; }
            this.controllerChanged = true;
            // Another tab may activate the worker while this tab is recording.
            // Only a local, idle confirmation authorizes reloading this page.
            if (this.reloadRequested && !this.activity.isBusy()) this.reload();
            else { this.reloadRequested = false; this.notify(); }
        };
        this.listen(this.container, 'controllerchange', changed);
        try {
            const registration = await this.container.register(url, { updateViaCache: 'none' });
            if (this.disposed) return;
            this.registration = registration;
            const inspectWaiting = () => { if (registration.waiting && this.container.controller) this.notify(); };
            const inspectInstalling = () => {
                const worker = registration.installing;
                if (worker) this.listen(worker, 'statechange', inspectWaiting);
                inspectWaiting();
            };
            this.listen(registration, 'updatefound', inspectInstalling);
            inspectInstalling();
            const check = () => { void registration.update().catch(() => {}); };
            const timer = setInterval(check, UPDATE_INTERVAL_MS);
            this.cleanups.push(() => clearInterval(timer));
            this.listen(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
        } catch (error) {
            if (!this.disposed) console.warn('Service worker registration failed:', error);
        }
    }

    applyUpdate() {
        if (this.disposed || this.activity.isBusy()) return false;
        if (this.controllerChanged) { this.reload(); return true; }
        if (!this.registration?.waiting) return false;
        this.reloadRequested = true;
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
    }

    dispose() {
        this.disposed = true;
        this.cleanups.splice(0).forEach(cleanup => cleanup());
    }

    private listen(target: EventTarget, event: string, listener: () => void) {
        target.addEventListener(event, listener);
        this.cleanups.push(() => target.removeEventListener(event, listener));
    }
}
