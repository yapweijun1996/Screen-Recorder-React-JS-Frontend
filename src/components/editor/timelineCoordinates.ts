export function sequenceTimeFromPixels(
    pixels: number,
    trackWidth: number,
    duration: number,
    originTime = 0,
): number {
    const time = originTime + (pixels / Math.max(1, trackWidth)) * duration;
    return Math.max(0, Math.min(duration, time));
}
