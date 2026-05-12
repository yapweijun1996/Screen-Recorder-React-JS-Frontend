import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private loaded: boolean = false;

  /**
   * Initialize FFmpeg.wasm.
   * Note: This downloads ~20-30MB of WASM files on first load.
   */
  async load() {
    if (this.loaded && this.ffmpeg) return;

    this.ffmpeg = new FFmpeg();

    // Log FFmpeg output to console for debugging
    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]:', message);
    });

    try {
      // Use same-origin assets to avoid cross-origin worker restrictions in sandboxed hosts
      // Files are served from public/ffmpeg (copied from @ffmpeg/ffmpeg and @ffmpeg/core)
      const baseURL = `${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/ffmpeg`;
      await this.ffmpeg.load({
        classWorkerURL: `${baseURL}/worker.js`,
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
        workerURL: `${baseURL}/worker.js`,
      });
      this.loaded = true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to load video processing engine. Please check your network connection.');
    }
  }

  /**
   * Converts a WebM Blob to MP4 and optionally trims it.
   */
  async processVideo(
    inputBlob: Blob, 
    options?: { trimStart?: number; trimEnd?: number }
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.loaded) {
      await this.load();
    }
    const ffmpeg = this.ffmpeg!;

    const inputName = 'input.webm';
    const outputName = 'output.mp4';

    // 1. Write file to FFmpeg's virtual file system
    await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));

    // 2. Build command
    // We use -preset ultrafast to speed up client-side encoding
    // We strictly use libx264 to ensure MP4 compatibility across all players
    const args = ['-i', inputName];

    if (options?.trimStart !== undefined && options?.trimEnd !== undefined) {
      // Precise trimming
      args.push('-ss', options.trimStart.toString());
      args.push('-to', options.trimEnd.toString());
    }

    // Output options: Encode to H.264 MP4
    // Note: If SharedArrayBuffer is missing, this might fail or be very slow.
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', outputName);

    // 3. Run command
    console.log('Running FFmpeg command:', args);
    await ffmpeg.exec(args);

    // 4. Read result
    const data = await ffmpeg.readFile(outputName);
    
    // Cleanup virtual file system to free memory
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    return new Blob([data], { type: 'video/mp4' });
  }

  isLoaded() {
    return this.loaded;
  }
}

export const ffmpegService = new FFmpegService();
