import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside the transcript dialog while it is open. */
export function useDialogFocus(dialogRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus());
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [dialogRef, onClose]);
}
