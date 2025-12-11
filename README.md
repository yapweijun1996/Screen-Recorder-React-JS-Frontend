# ScreenClip Pro
ScreenClip Pro is a browser-side screen recorder and editor that lets you capture a display, trim the result, and export an MP4 without ever sending footage to a server. It bundles a lightweight React 19/Vite shell with FFmpeg.wasm so the entire pipeline runs in the client.

## Directory layout
- `0_development/` - the actual source tree: React components, Vite config, the FFmpeg service, and helpers. All `npm` commands run from here.
- `0_development/public/ffmpeg/` - the worker and wasm blobs that FFmpeg.wasm needs. Vite copies this folder to the app root so the FFmpeg assets are served from `/ffmpeg/`.
- `metadata.json` - describes the permissions this experience requests (`display-capture`, `microphone`).
- `assets/`, `ffmpeg/`, `index.html` (root) - artifacts from a build. Treat them as generated output and do not edit them manually.

## Key pieces
- `components/Recorder` - uses `navigator.mediaDevices.getDisplayMedia` plus `MediaRecorder` to capture the screen and keep a short live preview.
- `components/Editor` - lets users preview the capture, drag the trim handles, and trigger MP4 exports that feed `services/ffmpegService`.
- `components/RangeSlider` - custom dual-handle slider for start/end times; it also notifies the editor to seek for a live preview.
- `services/ffmpegService` - loads FFmpeg.wasm from `public/ffmpeg`, pipes the WebM blob into it, and generates a libx264+AAC MP4.
- `utils/format.ts` and `types.ts` - shared helpers for formatting timestamps and managing the trimmed range.

## Getting started
1. Install Node 18 or newer (Vite and the FFmpeg packages expect a modern runtime).
2. `cd 0_development`
3. `npm install`
4. `npm run dev`
5. Open `http://localhost:3000`; Chrome and Edge provide the most reliable screen/audio capture.

## Available scripts (from `0_development`)
- `npm run dev` - starts the Vite dev server (`localhost:3000` by default).
- `npm run build` - bundles the SPA and emits a production build under `0_development/dist`.
- `npm run preview` - serves the production bundle locally so you can exercise the FFmpeg export from a built environment.

## FFmpeg and shared array buffers
- FFmpeg.wasm downloads around 20-30 MB of assets the first time it runs. The app loads them from `public/ffmpeg` (`worker.js`, `ffmpeg-core.wasm`, etc.), so keep that folder synchronized with `node_modules/@ffmpeg/ffmpeg/dist/`.
- The `index.html` and `0_development/index.html` headers already set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Any deployment must preserve those headers or equivalent meta tags so `SharedArrayBuffer` is available to the FFmpeg worker.
- The `ffmpegService` prepends `/ffmpeg` to `import.meta.env.BASE_URL`. If you serve the app from a subfolder, make sure the FFmpeg assets still live at `${BASE_URL}/ffmpeg/`.

## Usage notes
- The recording experience relies on browser screen sharing; most browsers prompt for display capture and (depending on the operating system) can optionally share system audio. If the user denies permissions, the UI surfaces the error token at the top.
- After recording, the trim handles are controlled by `RangeSlider`. The slider currently listens to mouse events only, so trimming on pure touch devices requires using a desktop browser or relying on the "Preview Selection" button, which seeks the video to the trimmed start.
- Export actions use the FFmpeg service to convert to MP4. The UI shows a spinner (`Button`'s `isLoading`) while FFmpeg runs, and the download link appears once the blob is ready.

## Troubleshooting
- If you see `SharedArrayBuffer` warnings or FFmpeg fails to load, double-check the COOP/COEP headers and that the `/ffmpeg` assets are reachable in the browser network tab.
- If `MediaRecorder` or `getDisplayMedia` is unavailable, the app will throw. Chrome 116+, Edge, and the latest Firefox offer the best support; Safari still has limitations around audio capture.
- You can inspect `[FFmpeg Log]:` messages in the console to see the full command line that runs during export.

## Next steps
- Keep `public/ffmpeg` in sync whenever you update `@ffmpeg/ffmpeg`; copy `worker.js`, `ffmpeg-core.wasm`, and the helper scripts from `node_modules/@ffmpeg/ffmpeg/dist/` (or regenerate them via your build pipeline).
- If you prefer a touch-friendly trim experience, enhance `components/RangeSlider` with pointer/touch support and keyboard focus states so the handles are usable on phones and tablets.
