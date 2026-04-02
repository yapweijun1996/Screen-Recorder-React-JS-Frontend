/**
 * AudioVisualizer - Provides real-time audio level visualization
 * Used to show users that their microphone is working
 */
export class AudioVisualizer {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;
    private animationId: number | null = null;
    private onLevelChange: ((level: number) => void) | null = null;

    /**
     * Start analyzing audio from a MediaStream
     */
    public start(stream: MediaStream, onLevelChange: (level: number) => void): void {
        this.onLevelChange = onLevelChange;

        // Check if stream has audio tracks
        if (stream.getAudioTracks().length === 0) {
            console.warn('AudioVisualizer: No audio tracks in stream');
            return;
        }

        try {
            this.audioContext = new AudioContext();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);

            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            this.analyze();
        } catch (error) {
            console.error('AudioVisualizer: Failed to start', error);
        }
    }

    private analyze = (): void => {
        if (!this.analyser || !this.dataArray || !this.onLevelChange) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average volume level (0-1 range)
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        const level = Math.min(1, average / 128); // Normalize to 0-1

        this.onLevelChange(level);

        this.animationId = requestAnimationFrame(this.analyze);
    };

    /**
     * Stop analyzing and cleanup
     */
    public stop(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.onLevelChange = null;
    }

    /**
     * Get current audio level synchronously (0-1 range)
     */
    public getLevel(): number {
        if (!this.analyser || !this.dataArray) return 0;

        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        return Math.min(1, (sum / this.dataArray.length) / 128);
    }
}

export const audioVisualizer = new AudioVisualizer();
