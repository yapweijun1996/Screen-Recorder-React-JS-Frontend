// Preference persistence is optional when the browser blocks storage access.
export function readPreference(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writePreference(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // The provider still owns the preference for the current session.
    }
}
