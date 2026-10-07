// Leases cover permission prompts, recording, persistence and export. They
// outlive individual renders, so an update cannot slip through a state change.
export class TaskActivity {
    private leases = new Set<symbol>();
    private listeners = new Set<() => void>();
    isBusy = () => this.leases.size > 0;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    begin() {
        const lease = Symbol();
        this.leases.add(lease);
        this.emit();
        return () => { if (this.leases.delete(lease)) this.emit(); };
    }
    private emit() { this.listeners.forEach(listener => listener()); }
}

export const taskActivity = new TaskActivity();

// Only capture sessions block navigation; exports keep their cancellation flow.
export const recordingActivity = new TaskActivity();
