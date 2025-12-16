
export interface CompositionOptions {
    width: number;
    height: number;
    frameRate: number;
    pipPosition?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
}

export class StreamCompositor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private audioContext: AudioContext | null = null;
    private audioDestination: MediaStreamAudioDestinationNode | null = null;

    private screenVideo: HTMLVideoElement;
    private cameraVideo: HTMLVideoElement | null = null;

    private width: number;
    private height: number;
    private frameRate: number;
    private isActive: boolean = false;
    private animationFrameId: number | null = null;
    private hasAudioSource: boolean = false;

    constructor(options: CompositionOptions) {
        this.width = options.width;
        this.height = options.height;
        this.frameRate = options.frameRate || 30;

        // Setup Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d', { alpha: false })!;

        // Setup Video Elements (Hidden)
        this.screenVideo = document.createElement('video');
        this.screenVideo.muted = true;
        this.screenVideo.autoplay = true;
        this.screenVideo.playsInline = true;

        this.cameraVideo = document.createElement('video');
        this.cameraVideo.muted = true;
        this.cameraVideo.autoplay = true;
        this.cameraVideo.playsInline = true;
    }

    public async start(screenStream: MediaStream, cameraStream?: MediaStream, micStream?: MediaStream): Promise<MediaStream> {
        this.isActive = true;
        this.hasAudioSource = false;

        // 1. Setup Video Sources
        this.screenVideo.srcObject = screenStream;

        // Wait for video to be ready before playing
        await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => {
                this.screenVideo.removeEventListener('canplay', onCanPlay);
                this.screenVideo.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e: Event) => {
                this.screenVideo.removeEventListener('canplay', onCanPlay);
                this.screenVideo.removeEventListener('error', onError);
                reject(new Error('Failed to load screen video'));
            };

            // If already ready, resolve immediately
            if (this.screenVideo.readyState >= 2) {
                resolve();
            } else {
                this.screenVideo.addEventListener('canplay', onCanPlay);
                this.screenVideo.addEventListener('error', onError);
            }
        });

        await this.screenVideo.play();

        if (cameraStream) {
            if (!this.cameraVideo) this.cameraVideo = document.createElement('video');
            this.cameraVideo.srcObject = cameraStream;
            await this.cameraVideo.play();
        }

        // 2. Setup Audio Mixing (ONLY if we have audio sources)
        const hasScreenAudio = screenStream.getAudioTracks().length > 0;
        const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

        if (hasScreenAudio || hasMicAudio) {
            // Only create AudioContext when we have audio to mix
            this.audioContext = new AudioContext();

            // CRITICAL: Resume AudioContext (browsers suspend it by default)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.audioDestination = this.audioContext.createMediaStreamDestination();

            // Mix Screen Audio
            if (hasScreenAudio) {
                const screenSource = this.audioContext.createMediaStreamSource(screenStream);
                screenSource.connect(this.audioDestination);
                this.hasAudioSource = true;
            }

            // Mix Mic Audio
            if (hasMicAudio && micStream) {
                const micSource = this.audioContext.createMediaStreamSource(micStream);
                micSource.connect(this.audioDestination);
                this.hasAudioSource = true;
            }
        }

        // 3. CRITICAL: Draw first frame BEFORE captureStream
        // Canvas must have content before captureStream() is called
        this.drawFrame();

        // 4. Capture Canvas Stream (now canvas has content)
        const canvasStream = this.canvas.captureStream(this.frameRate);

        // Verify video track is active
        const videoTrack = canvasStream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState !== 'live') {
            console.error('[StreamCompositor] Canvas video track is not live!', videoTrack?.readyState);
        }

        // 5. Start continuous draw loop AFTER captureStream
        this.startDrawLoop();

        // 6. Combine Canvas Video + Mixed Audio (only if we have audio)
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

        // Only add audio tracks if we actually have audio sources connected
        if (this.hasAudioSource && this.audioDestination) {
            tracks.push(...this.audioDestination.stream.getAudioTracks());
        }

        const finalStream = new MediaStream(tracks);

        console.log('[StreamCompositor] Final stream created:', {
            videoTracks: finalStream.getVideoTracks().length,
            audioTracks: finalStream.getAudioTracks().length,
            hasScreenAudio,
            hasMicAudio,
            canvasSize: `${this.width}x${this.height}`,
            frameRate: this.frameRate
        });

        return finalStream;
    }

    // Single frame draw (synchronous) - used before captureStream
    private drawFrame = () => {
        // Check if screen video is ready to draw
        if (this.screenVideo.readyState >= 2) {
            // Draw Background (Screen)
            this.ctx.drawImage(this.screenVideo, 0, 0, this.width, this.height);
        } else {
            // Fill with black if video not ready yet
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // Draw PIP (Camera) if exists and ready
        if (this.cameraVideo && this.cameraVideo.readyState >= 2 && this.cameraVideo.videoWidth > 0) {
            const pipWidth = this.width * 0.2; // 20% width
            const pipHeight = (pipWidth / this.cameraVideo.videoWidth) * this.cameraVideo.videoHeight;
            const padding = 20;

            // Position: Bottom Right
            const x = this.width - pipWidth - padding;
            const y = this.height - pipHeight - padding;

            // Draw Border/Shadow for Pro look
            this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;

            this.ctx.strokeRect(x, y, pipWidth, pipHeight);
            this.ctx.drawImage(this.cameraVideo, x, y, pipWidth, pipHeight);

            this.ctx.shadowBlur = 0; // Reset
        }
    }

    // Start continuous draw loop
    private startDrawLoop = () => {
        if (!this.isActive) return;

        // Draw current frame
        this.drawFrame();

        // Schedule next frame
        this.animationFrameId = requestAnimationFrame(this.startDrawLoop);
    }

    public stop() {
        this.isActive = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        // Close audio context if it was created
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        // Stop hidden videos
        this.screenVideo.pause();
        this.screenVideo.srcObject = null;
        if (this.cameraVideo) {
            this.cameraVideo.pause();
            this.cameraVideo.srcObject = null;
        }

        console.log('[StreamCompositor] Stopped and cleaned up');
    }
}
