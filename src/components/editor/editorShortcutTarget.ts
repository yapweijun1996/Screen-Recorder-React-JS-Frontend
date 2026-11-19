const interactive = 'button, a[href], input, select, textarea, summary, [role="button"], [role="textbox"], [role="slider"]';

export function canHandleEditorShortcut(event: KeyboardEvent): boolean {
    const target = event.target;
    if (event.defaultPrevented || event.isComposing || event.altKey || !(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || target.closest('dialog, [role="dialog"]')) return false;
    if (target !== document.body && target !== document.documentElement && !target.closest('[data-editor]')) return false;

    const control = target.closest(interactive);
    if (!control) return true;
    return control.hasAttribute('data-timeline-clip') && event.code !== 'Space' && event.code !== 'Enter';
}
