import { PIPConfig, PIPPosition } from '../types';

export interface CompositionOptions {
    width: number;
    height: number;
    frameRate: number;
    pipConfig?: PIPConfig;
}

export class StreamCompositor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private audioContext: AudioContext;
    private audioDestination: MediaStreamAudioDestinationNode;

    private screenVideo: HTMLVideoElement;
    private cameraVideo: HTMLVideoElement | null = null;

    private width: number;
    private height: number;
    private isActive: boolean = false;
    private isPaused: boolean = false;
    private animationFrameId: number | null = null;

    // PIP Configuration (draggable)
    private pipConfig: PIPConfig = {
        position: 'bottom-right',
        size: 0.2 // 20% of canvas width
    };

    constructor(options: CompositionOptions) {
        this.width = options.width;
        this.height = options.height;

        if (options.pipConfig) {
            this.pipConfig = options.pipConfig;
        }

        // Setup Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d', { alpha: false })!;

        // Setup Audio Context
        this.audioContext = new AudioContext();
        this.audioDestination = this.audioContext.createMediaStreamDestination();

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

    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    public setPIPConfig(config: Partial<PIPConfig>) {
        this.pipConfig = { ...this.pipConfig, ...config };
    }

    public getPIPConfig(): PIPConfig {
        return { ...this.pipConfig };
    }

    /**
     * Set PIP position using normalized coordinates (0-1 range)
     */
    public setPIPPosition(x: number, y: number) {
        this.pipConfig.position = 'custom';
        this.pipConfig.x = Math.max(0, Math.min(1, x));
        this.pipConfig.y = Math.max(0, Math.min(1, y));
    }

    /**
     * Set PIP to a preset corner position
     */
    public setPIPPresetPosition(position: PIPPosition) {
        this.pipConfig.position = position;
        delete this.pipConfig.x;
        delete this.pipConfig.y;
    }

    public async start(screenStream: MediaStream, cameraStream?: MediaStream, micStream?: MediaStream): Promise<MediaStream> {
        this.isActive = true;
        this.isPaused = false;

        // 1. Setup Video Sources
        this.screenVideo.srcObject = screenStream;
        await this.screenVideo.play();

        if (cameraStream) {
            if (!this.cameraVideo) this.cameraVideo = document.createElement('video');
            this.cameraVideo.srcObject = cameraStream;
            await this.cameraVideo.play();
        }

        // 2. Setup Audio Mixing
        // Mix Screen Audio
        if (screenStream.getAudioTracks().length > 0) {
            const screenSource = this.audioContext.createMediaStreamSource(screenStream);
            screenSource.connect(this.audioDestination);
        }

        // Mix Mic Audio
        if (micStream && micStream.getAudioTracks().length > 0) {
            const micSource = this.audioContext.createMediaStreamSource(micStream);
            micSource.connect(this.audioDestination);
        }

        // 3. Start Draw Loop
        this.draw();

        // 4. Capture Canvas Stream
        const canvasStream = this.canvas.captureStream(30); // 30 FPS

        // 5. Combine Canvas Video + Mixed Audio
        const finalStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...this.audioDestination.stream.getAudioTracks()
        ]);

        return finalStream;
    }

    /**
     * Calculate PIP coordinates based on configuration
     */
    private calculatePIPCoords(): { x: number; y: number; width: number; height: number } {
        if (!this.cameraVideo) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const pipWidth = this.width * this.pipConfig.size;
        const aspectRatio = this.cameraVideo.videoHeight / this.cameraVideo.videoWidth || 0.5625; // Default 16:9
        const pipHeight = pipWidth * aspectRatio;
        const padding = 20;

        let x: number;
        let y: number;

        if (this.pipConfig.position === 'custom' && this.pipConfig.x !== undefined && this.pipConfig.y !== undefined) {
            // Custom position (normalized 0-1 coordinates, clamped to stay on screen)
            x = this.pipConfig.x * (this.width - pipWidth);
            y = this.pipConfig.y * (this.height - pipHeight);
        } else {
            // Preset positions
            switch (this.pipConfig.position) {
                case 'top-left':
                    x = padding;
                    y = padding;
                    break;
                case 'top-right':
                    x = this.width - pipWidth - padding;
                    y = padding;
                    break;
                case 'bottom-left':
                    x = padding;
                    y = this.height - pipHeight - padding;
                    break;
                case 'bottom-right':
                default:
                    x = this.width - pipWidth - padding;
                    y = this.height - pipHeight - padding;
                    break;
            }
        }

        return { x, y, width: pipWidth, height: pipHeight };
    }

    private draw = () => {
        if (!this.isActive) return;

        // Skip drawing if paused (but keep the loop running for resume)
        if (!this.isPaused) {
            // Draw Background (Screen)
            this.ctx.drawImage(this.screenVideo, 0, 0, this.width, this.height);

            // Draw PIP (Camera) if exists
            if (this.cameraVideo && this.cameraVideo.readyState === 4) {
                const pip = this.calculatePIPCoords();

                // Draw rounded rectangle with border for pro look
                this.ctx.save();

                // Create rounded clip path
                const radius = 12;
                this.ctx.beginPath();
                this.ctx.roundRect(pip.x, pip.y, pip.width, pip.height, radius);
                this.ctx.clip();

                // Draw camera
                this.ctx.drawImage(this.cameraVideo, pip.x, pip.y, pip.width, pip.height);

                this.ctx.restore();

                // Draw border
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.roundRect(pip.x, pip.y, pip.width, pip.height, radius);
                this.ctx.stroke();

                // Draw shadow effect
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 5;
            }
        }

        this.animationFrameId = requestAnimationFrame(this.draw);
    }

    public pause() {
        this.isPaused = true;
        // Suspend audio context to save resources
        if (this.audioContext.state === 'running') {
            this.audioContext.suspend();
        }
    }

    public resume() {
        this.isPaused = false;
        // Resume audio context
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    public isPausedState(): boolean {
        return this.isPaused;
    }

    public stop() {
        this.isActive = false;
        this.isPaused = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        // Close context
        if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        // Stop hidden videos
        this.screenVideo.pause();
        this.screenVideo.srcObject = null;
        if (this.cameraVideo) {
            this.cameraVideo.pause();
            this.cameraVideo.srcObject = null;
        }
    }
}
