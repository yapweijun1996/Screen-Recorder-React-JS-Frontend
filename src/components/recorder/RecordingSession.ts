import type { StreamCompositor } from '../../utils/StreamCompositor';
import { taskActivity } from '../../services/taskActivity';
import { closeAudioMix, stopTracks, type AudioMix } from './recorderControllerUtils';

/** Owns raw device streams as well as the derived recording stream. */
export class RecordingSession {
    private streams = new Set<MediaStream>();
    private endActivity = taskActivity.begin();
    recorder: MediaRecorder | null = null;
    compositor: StreamCompositor | null = null;
    audioMix: AudioMix | null = null;
    disposed = false;

    ownStream(stream: MediaStream): MediaStream {
        // A permission dialog can finish after its component has unmounted.
        if (this.disposed) {
            stopTracks(stream);
            throw new DOMException('Recording cancelled', 'AbortError');
        }
        this.streams.add(stream);
        return stream;
    }

    ownComposition(composition: {
        finalStream: MediaStream;
        compositor: StreamCompositor | null;
        audioMix: AudioMix | null;
    }): MediaStream {
        if (this.disposed) {
            composition.compositor?.stop();
            void closeAudioMix(composition.audioMix);
            stopTracks(composition.finalStream);
            throw new DOMException('Recording cancelled', 'AbortError');
        }
        this.compositor = composition.compositor;
        this.audioMix = composition.audioMix;
        return this.ownStream(composition.finalStream);
    }

    release() {
        if (this.disposed) return;
        this.disposed = true;
        this.endActivity();
        // Detach callbacks before stopping tracks, preventing late finalization
        // from replacing the page the user navigated to.
        if (this.recorder) {
            this.recorder.ondataavailable = null;
            this.recorder.onstop = null;
            this.recorder.onerror = null;
            if (this.recorder.state !== 'inactive') {
                try { this.recorder.stop(); } catch (error) { console.warn('Failed to stop recorder', error); }
            }
            this.recorder = null;
        }
        for (const stream of this.streams) {
            stream.getTracks().forEach(track => { track.onended = null; });
            stopTracks(stream);
        }
        this.streams.clear();
        this.compositor?.stop();
        this.compositor = null;
        void closeAudioMix(this.audioMix);
        this.audioMix = null;
    }
}
