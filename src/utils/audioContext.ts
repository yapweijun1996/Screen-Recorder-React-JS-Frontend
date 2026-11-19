/**
 * Capture permission prompts can suspend an AudioContext before recording
 * starts. Resume it before exposing its destination track to MediaRecorder.
 */
const AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 3000;

export async function resumeAudioContext(context: AudioContext): Promise<void> {
    if (context.state === 'running') return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            context.resume(),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('AudioContext resume timed out'));
                }, AUDIO_CONTEXT_RESUME_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    if ((context.state as AudioContextState) !== 'running') {
        throw new Error('AudioContext did not enter the running state');
    }
}
