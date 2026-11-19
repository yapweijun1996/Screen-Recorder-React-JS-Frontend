import type { TaskActivity } from './taskActivity';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const VERSION_QUERY_TIMEOUT_MS = 750;

export type UpdateCheckStatus = 'available' | 'installing' | 'up-to-date' | 'no-worker' | 'failed';

export interface UpdateCheckResult {
    status: UpdateCheckStatus;
    currentVersion: string;
    waitingVersion: string | null;
    installingVersion: string | null;
}

export type UpdateAvailableHandler = (waitingVersion?: string | null) => void;

export class ServiceWorkerUpdates {
    private registration: ServiceWorkerRegistration | null = null;
    private cleanups: Array<() => void> = [];
    private trackedWorkers = new Set<ServiceWorker>();
    private disposed = false;
    private hadController: boolean;
    private reloadRequested = false;
    private controllerChanged = false;
    private registrationError: unknown = null;
    private startPromise: Promise<void> | null = null;
    private checkPromise: Promise<UpdateCheckResult> | null = null;

    constructor(
        private container: ServiceWorkerContainer,
        private activity: TaskActivity,
        private notify: UpdateAvailableHandler,
        private reload: () => void,
        private currentVersion: () => string = () => 'unknown',
    ) { this.hadController = !!container.controller; }

    async start(url: string) {
        if (this.disposed || this.startPromise) return this.startPromise ?? Promise.resolve();
        this.startPromise = this.register(url);
        await this.startPromise;
    }

    checkForUpdates(): Promise<UpdateCheckResult> {
        if (this.checkPromise) return this.checkPromise;
        this.checkPromise = this.checkForUpdatesInternal().finally(() => {
            this.checkPromise = null;
        });
        return this.checkPromise;
    }

    applyUpdate() {
        if (this.disposed || this.activity.isBusy()) return false;
        if (this.controllerChanged) { this.reload(); return true; }
        const waiting = this.registration?.waiting;
        if (!waiting) return false;
        if (this.reloadRequested) return true;
        try {
            this.reloadRequested = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
            return true;
        } catch {
            this.reloadRequested = false;
            return false;
        }
    }

    dispose() {
        this.disposed = true;
        this.cleanups.splice(0).forEach(cleanup => cleanup());
        this.trackedWorkers.clear();
    }

    private async register(url: string) {
        const changed = () => {
            if (!this.hadController && !this.reloadRequested) { this.hadController = true; return; }
            this.controllerChanged = true;
            // Another tab may activate the worker while this tab is recording.
            // Only a local, idle confirmation authorizes reloading this page.
            if (this.reloadRequested && !this.activity.isBusy()) this.reload();
            else {
                this.reloadRequested = false;
                this.notify(null);
                void this.notifyWorkerVersion(this.container.controller);
            }
        };
        this.listen(this.container, 'controllerchange', changed);
        try {
            const registration = await this.container.register(url, { updateViaCache: 'none' });
            if (this.disposed) return;
            this.registration = registration;
            const inspectWaiting = () => {
                if (registration.waiting && this.container.controller) this.notifyWaiting(registration.waiting);
            };
            const inspectInstalling = () => {
                const worker = registration.installing;
                if (worker && !this.trackedWorkers.has(worker)) {
                    this.trackedWorkers.add(worker);
                    this.listen(worker, 'statechange', inspectWaiting);
                }
                inspectWaiting();
            };
            this.listen(registration, 'updatefound', inspectInstalling);
            inspectInstalling();
            const check = () => { void registration.update().catch(() => {}); };
            const timer = setInterval(check, UPDATE_INTERVAL_MS);
            this.cleanups.push(() => clearInterval(timer));
            if (typeof document !== 'undefined') {
                this.listen(document, 'visibilitychange', () => {
                    if (document.visibilityState === 'visible') check();
                });
            }
        } catch (error) {
            this.registrationError = error;
            if (!this.disposed) console.warn('Service worker registration failed:', error);
        }
    }

    private async checkForUpdatesInternal(): Promise<UpdateCheckResult> {
        if (this.startPromise) await this.startPromise;
        if (this.disposed) return this.result('failed');
        const registration = this.registration;
        if (!registration) return this.result(this.registrationError ? 'failed' : 'no-worker');
        if (this.controllerChanged) {
            const activatedVersion = await this.readWorkerVersion(registration.active ?? this.container.controller);
            this.notify(activatedVersion);
            return {
                status: 'available',
                currentVersion: this.getCurrentVersion(),
                waitingVersion: activatedVersion,
                installingVersion: null,
            };
        }
        try {
            await registration.update();
        } catch {
            return this.result('failed');
        }

        const waiting = registration.waiting;
        const installing = registration.installing;
        const active = registration.active ?? this.container.controller;
        const [activeWorkerVersion, waitingVersion, installingVersion] = await Promise.all([
            this.readWorkerVersion(active),
            this.readWorkerVersion(waiting),
            this.readWorkerVersion(installing),
        ]);
        const changedVersion = this.controllerChanged ? activeWorkerVersion : null;
        const effectiveWaitingVersion = this.controllerChanged ? changedVersion : waitingVersion;
        const status = this.controllerChanged
            ? 'available'
            : !this.container.controller ? 'no-worker' : waiting ? 'available' : installing ? 'installing' : 'up-to-date';
        const result = {
            status,
            // This is the page build, not a worker activated by another tab.
            currentVersion: this.getCurrentVersion(),
            waitingVersion: effectiveWaitingVersion,
            installingVersion,
        } satisfies Omit<UpdateCheckResult, 'status'> & { status: UpdateCheckStatus };
        if (result.status === 'available') this.notify(effectiveWaitingVersion);
        return result;
    }

    private listen(target: EventTarget, event: string, listener: () => void) {
        target.addEventListener(event, listener);
        this.cleanups.push(() => target.removeEventListener(event, listener));
    }

    private notifyWaiting(worker: ServiceWorker) {
        // Prompt immediately for versionless workers; upgrade the label if the worker answers.
        this.notify(null);
        void this.notifyWorkerVersion(worker);
    }

    private async notifyWorkerVersion(worker: ServiceWorker | null) {
        const version = await this.readWorkerVersion(worker);
        const target = this.controllerChanged ? this.container.controller : this.registration?.waiting;
        if (!this.disposed && version !== null && worker === target) this.notify(version);
    }

    private async readWorkerVersion(worker: ServiceWorker | null): Promise<string | null> {
        if (!worker || typeof MessageChannel === 'undefined') return null;
        // Keep compatibility with lightweight/versionless worker doubles and old browsers.
        if (!('state' in worker) && !('scriptURL' in worker)) return null;
        const channel = new MessageChannel();
        return new Promise(resolve => {
            let settled = false;
            const finish = (version: string | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                channel.port1.close();
                channel.port2.close();
                resolve(version);
            };
            const timeout = setTimeout(() => finish(null), VERSION_QUERY_TIMEOUT_MS);
            channel.port1.onmessage = event => {
                const data = event.data as { type?: unknown; version?: unknown };
                finish(data?.type === 'BUILD_VERSION' && typeof data.version === 'string' ? data.version : null);
            };
            try {
                worker.postMessage({ type: 'GET_BUILD_VERSION' }, [channel.port2]);
            } catch {
                finish(null);
            }
        });
    }

    private result(status: UpdateCheckStatus): UpdateCheckResult {
        return {
            status,
            currentVersion: this.getCurrentVersion(),
            waitingVersion: null,
            installingVersion: null,
        };
    }

    private getCurrentVersion() {
        try { return this.currentVersion(); } catch { return 'unknown'; }
    }
}
