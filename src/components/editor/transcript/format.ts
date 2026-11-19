export const formatTimestamp = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = safeSeconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
        : `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export const clampProgress = (progress: number) => {
    const normalized = progress <= 1 ? progress * 100 : progress;
    return Math.round(Math.min(100, Math.max(0, normalized)));
};
