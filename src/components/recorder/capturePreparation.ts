import type { PIPPosition } from '../../types';
import type { RecordingSession } from './RecordingSession';
import { createFinalStream } from './recorderControllerUtils';

export class ScreenCaptureEndedError extends Error {
    name = 'ScreenCaptureEndedError';
}

interface CapturePreparationOptions {
    session: RecordingSession;
    enableMic: boolean;
    enableCam: boolean;
    pipPosition: PIPPosition;
    frameRate: number;
    onScreenEnded: () => void;
}

function assertScreenCaptureActive(session: RecordingSession, track: MediaStreamTrack): void {
    if (session.disposed) throw new DOMException('Recording cancelled', 'AbortError');
    if (track.readyState === 'ended') {
        throw new ScreenCaptureEndedError('Screen capture ended before recording started');
    }
}

export async function prepareCapture({
    session,
    enableMic,
    enableCam,
    pipPosition,
    frameRate,
    onScreenEnded,
}: CapturePreparationOptions): Promise<{ finalStream: MediaStream; screenTrack: MediaStreamTrack; micStream?: MediaStream }> {
    const screenStream = session.ownStream(await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: 2560, max: 3840 },
            height: { ideal: 1440, max: 2160 },
            frameRate: { ideal: frameRate, max: frameRate },
        },
        audio: true,
    }));
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) throw new ScreenCaptureEndedError('Screen capture did not provide a video track');
    screenTrack.onended = onScreenEnded;
    assertScreenCaptureActive(session, screenTrack);

    let micStream: MediaStream | undefined;
    if (enableMic) {
        micStream = session.ownStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
        assertScreenCaptureActive(session, screenTrack);
    }

    let camStream: MediaStream | undefined;
    if (enableCam) {
        camStream = session.ownStream(await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } }));
        assertScreenCaptureActive(session, screenTrack);
    }

    const composition = await createFinalStream({
        screenStream,
        camStream,
        micStream,
        enableCam,
        pipPosition,
        frameRate,
    });
    const finalStream = session.ownComposition(composition);
    assertScreenCaptureActive(session, screenTrack);
    return { finalStream, screenTrack, micStream };
}
