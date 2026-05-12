# Architecture

ScreenClip Pro is a single-page React app that runs **entirely in the browser**. There is no backend, no upload, no server-side encoding. All capture, compositing, encoding, and storage happens locally.

## Top-level Flow

```
┌─────────────┐    user clicks "Stop"     ┌──────────────┐
│  Recorder   │ ─────────────────────────►│   Editor     │
│  (capture)  │  MediaRecorder Blob       │  (trim/      │
│             │  → IndexedDB → handoff    │   export)    │
└─────────────┘                           └──────────────┘
       │                                          │
       ▼                                          ▼
  getDisplayMedia                          WebCodecs Pipeline
  getUserMedia                             → mp4-muxer / webm-muxer
  StreamCompositor                         → MP4 / WebM Blob → download
  MediaRecorder
```

## Module Map

### Entry

- [`src/index.tsx`](../src/index.tsx) — mounts React app, registers service worker
- [`src/App.tsx`](../src/App.tsx) — top-level state machine: `IDLE → RECORDING → REVIEWING → EDITING`
- [`src/registerSW.ts`](../src/registerSW.ts) — PWA auto-update with forced reload, hourly polling, and `visibilitychange` re-check

### Recorder

- [`src/components/Recorder.tsx`](../src/components/Recorder.tsx) — root component for recording mode
- [`src/components/recorder/RecorderSidebar.tsx`](../src/components/recorder/RecorderSidebar.tsx) — source toggles (mic, cam, quality preset, FPS, bitrate)
- [`src/components/recorder/RecorderPreview.tsx`](../src/components/recorder/RecorderPreview.tsx) — live preview of the composited stream
- [`src/components/recorder/useRecorderController.ts`](../src/components/recorder/useRecorderController.ts) — recording orchestration: requests permissions, wires `StreamCompositor`, runs `MediaRecorder`, finalizes on stop
- [`src/utils/StreamCompositor.ts`](../src/utils/StreamCompositor.ts) — `<canvas>`-based mixer: draws screen video + draggable PIP cam, mixes screen audio + mic via `AudioContext`, then `canvas.captureStream(fps)` gives one combined `MediaStream` to `MediaRecorder`
- [`src/utils/AudioVisualizer.ts`](../src/utils/AudioVisualizer.ts) — mic level meter via `AnalyserNode`

Output of the recorder is a `Blob` (WebM/VP9 on Chrome, WebM/VP8 on Firefox), saved to IndexedDB via [`videoStorageService.ts`](../src/services/videoStorageService.ts) and passed to the editor.

### Editor

- [`src/components/Editor.tsx`](../src/components/Editor.tsx) — root: layout grid (preview + sidebar + timeline + bottom bar)
- [`src/components/editor/EditorLayout.tsx`](../src/components/editor/EditorLayout.tsx) — responsive grid scaffold
- [`src/components/editor/EditorPlayer.tsx`](../src/components/editor/EditorPlayer.tsx) — `<video>` playback, playhead sync
- [`src/components/editor/SegmentsTimeline.tsx`](../src/components/editor/SegmentsTimeline.tsx) + [`ProTimeline.tsx`](../src/components/editor/ProTimeline.tsx) — timeline with keep/remove segments, drag-to-trim
- [`src/components/editor/EditorTrimPanel.tsx`](../src/components/editor/EditorTrimPanel.tsx) — segment list + manual trim entry
- [`src/components/editor/EditorExportPanel.tsx`](../src/components/editor/EditorExportPanel.tsx) — quality / resolution / fps / format picker
- [`src/components/editor/useEditorExportController.ts`](../src/components/editor/useEditorExportController.ts) — drives the export: builds `ExportOptions`, calls `exportService.processVideo()`, shows progress

### Services

- [`src/services/exportService.ts`](../src/services/exportService.ts) — public API the UI calls; routes to the WebCodecs pipeline and emits a single progress stream
- [`src/services/videoStorageService.ts`](../src/services/videoStorageService.ts) — IndexedDB store for the in-progress recording blob (survives reloads mid-edit)
- [`src/services/webcodecs/capability.ts`](../src/services/webcodecs/capability.ts) — feature detection. Performs a **trial encode of one tiny frame** for both H.264 and VP8 to avoid Firefox's "H.264 reported supported but throws on encode" lie
- [`src/services/webcodecs/webcodecExportService.ts`](../src/services/webcodecs/webcodecExportService.ts) — the export pipeline. See [EXPORT_PIPELINE.md](EXPORT_PIPELINE.md)

### Cross-cutting

- [`src/context/ThemeContext.tsx`](../src/context/ThemeContext.tsx) — light/dark mode, persists to localStorage
- [`src/i18n/index.tsx`](../src/i18n/index.tsx) + [`src/i18n/locales/*.ts`](../src/i18n/locales/) — `t('key.path')` lookup; 10 languages
- [`src/types.ts`](../src/types.ts) — central type definitions and `VIDEO_QUALITY_PRESETS`

## Data Flow

```
Recorder                              Editor                         Export
────────                              ──────                         ──────
getDisplayMedia ─┐                    blob from IDB                  blob + options
                 ├─ StreamCompositor ─►  ─► <video>.src              ─► capability.ts
getUserMedia  ──┘   (canvas mix)         playback                    ─► webcodecExport
                       │                                                 ├─ <video> @ 16x
                       ▼                                                 │  + rVFC
                  MediaRecorder                                          ├─ canvas resample
                       │                                                 ├─ VideoEncoder
                       ▼                                                 ├─ AudioEncoder
                  WebM Blob ───────────► IndexedDB                       └─ muxer
                                              │                              │
                                              └─► Editor ◄────────► MP4/WebM Blob → download
```

## Key Conventions

- **No backend.** Anything that smells like a fetch to an API is a bug.
- **No GPL dependencies.** ffmpeg.wasm was removed in commit `7d4ba16`. Re-introducing it would re-trigger copyleft. Use MIT muxers + WebCodecs instead.
- **Trial-encode for capability detection.** `VideoEncoder.isConfigSupported()` lies on Firefox; always confirm with a real one-frame encode (see [`capability.ts`](../src/services/webcodecs/capability.ts)).
- **Browser-fork-tolerant.** Chrome and Firefox produce subtly different `MediaRecorder` output. Code must work on both — the Chrome WebM `duration=Infinity` quirk handled in [EXPORT_PIPELINE.md](EXPORT_PIPELINE.md#chrome-webm-duration-infinity-quirk) is one example.
- **Constant-memory export.** Never buffer the full clip in RAM. The streaming pipeline holds at most 2 `ImageBitmap`s at a time.

## Build & PWA

`vite-plugin-pwa` generates `dist/sw.js` (workbox-based) on `npm run build`. Service worker behavior is described in [PWA.md](PWA.md).
