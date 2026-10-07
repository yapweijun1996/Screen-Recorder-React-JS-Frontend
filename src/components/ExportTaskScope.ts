import { taskActivity } from '../services/taskActivity';

// One UI owner controls cancellation and result URLs. Old operations cannot
// publish into a new operation, including after navigation or unmount.
export class ExportTaskScope {
    private active = true;
    private controller: AbortController | null = null;
    private url: string | null = null;
    private endActivity: (() => void) | null = null;

    activate() { this.active = true; }

    start() {
        this.cancel();
        this.clearOutput();
        if (!this.active) throw new DOMException('Export cancelled', 'AbortError');
        const controller = new AbortController();
        this.controller = controller;
        this.endActivity = taskActivity.begin();
        return controller;
    }

    isCurrent(controller: AbortController) {
        return this.active && this.controller === controller && !controller.signal.aborted;
    }

    publish(controller: AbortController, blob: Blob) {
        if (!this.isCurrent(controller)) return null;
        this.clearOutput();
        this.url = URL.createObjectURL(blob);
        return this.url;
    }

    finish(controller: AbortController) {
        if (this.controller === controller) {
            this.controller = null;
            this.endActivity?.();
            this.endActivity = null;
        }
    }

    cancel() {
        this.controller?.abort();
        this.controller = null;
        this.endActivity?.();
        this.endActivity = null;
    }

    clearOutput() {
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null;
    }

    dispose() {
        this.active = false;
        this.cancel();
        this.clearOutput();
    }
}
