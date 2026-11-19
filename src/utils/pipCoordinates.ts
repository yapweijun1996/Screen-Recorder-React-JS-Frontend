import type { PIPConfig } from '../types';

export const calculatePIPCoords = (
    width: number,
    height: number,
    cameraVideo: HTMLVideoElement,
    pipConfig: PIPConfig,
): { x: number; y: number; width: number; height: number } => {
    const pipWidth = width * pipConfig.size;
    const aspectRatio = cameraVideo.videoHeight / cameraVideo.videoWidth || 0.5625;
    const pipHeight = pipWidth * aspectRatio;
    const padding = 20;
    let x: number;
    let y: number;

    if (pipConfig.position === 'custom' && pipConfig.x !== undefined && pipConfig.y !== undefined) {
        x = pipConfig.x * (width - pipWidth);
        y = pipConfig.y * (height - pipHeight);
    } else {
        switch (pipConfig.position) {
            case 'top-left':
                x = padding;
                y = padding;
                break;
            case 'top-right':
                x = width - pipWidth - padding;
                y = padding;
                break;
            case 'bottom-left':
                x = padding;
                y = height - pipHeight - padding;
                break;
            case 'bottom-right':
            default:
                x = width - pipWidth - padding;
                y = height - pipHeight - padding;
                break;
        }
    }

    return { x, y, width: pipWidth, height: pipHeight };
};
