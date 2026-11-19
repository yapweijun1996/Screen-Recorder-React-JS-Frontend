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
- [`src/App.tsx`](../src/App.tsx) — page navigation and recording-scoped draft provider; `useVideoSession` owns restore/finalize/reset (`IDLE → PROCESSING → REVIEWING`)
- [`src/registerSW.ts`](../src/registerSW.ts) — PWA registration with waiting-worker notification, hourly/visibility checks, and confirmed idle reload

### Recorder

- [`src/components/Recorder.tsx`](../src/components/Recorder.tsx) — root component for recording mode
- [`src/components/recorder/RecorderSidebar.tsx`](../src/components/recorder/RecorderSidebar.tsx) — source toggles (mic, cam, quality preset, FPS, bitrate)
- [`src/components/recorder/RecorderPreview.tsx`](../src/components/recorder/RecorderPreview.tsx) — live preview of the composited stream
- [`src/components/recorder/useRecorderController.ts`](../src/components/recorder/useRecorderController.ts) — recording orchestration: requests permissions, wires `StreamCompositor`, runs `MediaRecorder`, finalizes on stop
- [`src/utils/StreamCompositor.ts`](../src/utils/StreamCompositor.ts) — `<canvas>`-based mixer: draws screen video and the camera overlay at a preset corner, mixes screen audio and microphone through `AudioContext`, and passes a combined `MediaStream` to `MediaRecorder`
- [`src/utils/AudioVisualizer.ts`](../src/utils/AudioVisualizer.ts) — mic level meter via `AnalyserNode`

Output of the recorder is a `Blob` (WebM/VP9 on Chrome, WebM/VP8 on Firefox), saved to IndexedDB via [`videoStorageService.ts`](../src/services/videoStorageService.ts) and passed to the editor.

### Editor

- [`src/components/Editor.tsx`](../src/components/Editor.tsx) — root: layout grid (preview + sidebar + timeline + bottom bar)
- [`src/components/editor/EditorLayout.tsx`](../src/components/editor/EditorLayout.tsx) — responsive grid scaffold
- [`src/components/editor/EditorPlayer.tsx`](../src/components/editor/EditorPlayer.tsx) — `<video>` playback, playhead sync
- [`src/components/editor/ProTimeline.tsx`](../src/components/editor/ProTimeline.tsx) — active timeline for clip splitting, removal, and drag-to-trim
- [`src/components/editor/useClipTrim.ts`](../src/components/editor/useClipTrim.ts) — pointer-captured trim previews with a frozen zoom scale, adjacent-clip limits and one undo entry per completed drag; cancelled gestures discard the preview
- [`src/components/editor/useTimelineInteraction.ts`](../src/components/editor/useTimelineInteraction.ts) — sequence/source coordinate mapping, zoom and timeline interaction; `TimelineActions.tsx` renders the timeline action buttons
- [`src/components/editor/InspectorPanel.tsx`](../src/components/editor/InspectorPanel.tsx) — active quality, resolution, frame-rate, and format controls
- [`src/components/editor/useEditorExportController.ts`](../src/components/editor/useEditorExportController.ts) — drives the export: builds `ExportOptions`, calls `exportService.processVideo()`, shows progress

Blade clicks convert the clicked clip rectangle to its source timestamp and pass the clip index with the split action. The reducer splits that clip atomically even when another clip is selected. Ruler clicks use the sequence/source mapping; keyboard and toolbar splits continue to use the selected clip. Blade mode hides trim handles to keep the click target unambiguous.

### Services

- [`src/services/exportService.ts`](../src/services/exportService.ts) — public API the UI calls; routes to the WebCodecs pipeline with an independent progress callback per operation
- [`src/services/videoStorageService.ts`](../src/services/videoStorageService.ts) — IndexedDB store for the recording blob; writes and deletes resolve only after transaction commit
- [`src/services/webcodecs/capability.ts`](../src/services/webcodecs/capability.ts) — feature detection. Performs a **trial encode of one tiny frame** for both H.264 and VP8 to avoid Firefox's "H.264 reported supported but throws on encode" lie
- [`src/services/webcodecs/webcodecExportService.ts`](../src/services/webcodecs/webcodecExportService.ts) — export coordinator. `exportHelpers.ts` owns source setup; `exportTimeline.ts` owns the shared cut timeline; `exportVideo.ts` owns lazy packet decoding; `encodeVideoFrames.ts` owns timestamp sampling, bounded encoding and failure propagation; `exportAudio.ts`, `encodeAudioTimeline.ts` and `audioTrackProbe.ts` read audio lazily and preserve sound or stop with a visible failure. See [EXPORT_PIPELINE.md](EXPORT_PIPELINE.md)

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
                       │                                                 ├─ VideoSampleSink
                       ▼                                                 │  requested timestamps
                  MediaRecorder                                          ├─ aspect-preserving canvas
                       │                                                 ├─ VideoEncoder
                       ▼                                                 ├─ AudioEncoder
                  WebM Blob ───────────► IndexedDB                       └─ muxer
                                              │                              │
                                              └─► Editor ◄────────► MP4/WebM Blob → download
```

## Key Conventions

- **No backend.** Anything that smells like a fetch to an API is a bug.
- **No GPL dependencies.** ffmpeg.wasm was removed in commit `7d4ba16`. Re-introducing it would re-trigger copyleft. Use WebCodecs and the MIT muxers. The unmodified Mediabunny demuxer is MPL-2.0; its license and upstream source link are included in the distribution.
- **Trial-encode for capability detection.** `VideoEncoder.isConfigSupported()` lies on Firefox; always confirm with a real one-frame encode (see [`capability.ts`](../src/services/webcodecs/capability.ts)).
- **Browser-fork-tolerant.** Chrome and Firefox produce subtly different `MediaRecorder` output. Code must work on both — the Chrome WebM `duration=Infinity` quirk handled in [EXPORT_PIPELINE.md](EXPORT_PIPELINE.md#chrome-webm-duration-infinity-quirk) is one example.
- **Bounded decoded media.** Decoder prefetch applies backpressure. The video pass owns one current sample/canvas and at most four pending encoder inputs; audio uses bounded samples and encoder inputs. Compressed output, deadlines and container indexes still grow with clip length. Each Mediabunny input uses an 8 MiB file read cache.

## Build & PWA

`vite-plugin-pwa` generates `dist/sw.js` (workbox-based) on `npm run build`. Service worker behavior is described in [PWA.md](PWA.md).

## Recording Lifecycle

`RecordingSession` owns every acquired screen, microphone and camera stream, the derived recording stream, compositor, audio mix and MediaRecorder callbacks. Completion, recorder interruption, empty output, startup failure and component unmount share idempotent cleanup. The stop request locks the controls while the final MediaRecorder events settle. A recorder error prevents partial chunks from reaching the ordinary recording-complete path. The session rejects and releases permission or composition results arriving after disposal.

A separate `recordingActivity` lease disables navigation to the converter from the initial permission prompt through recording, pauses and stop finalization. The navigation handler also checks the live lease before changing pages. Completion or startup failure releases this protection; export activity does not block navigation.

Export quality presets control bitrate. CRF is not part of the export contract or user interface.

## Local transcription

`TranscriptionProvider` owns the current recording's caption session above the recorder/converter switch. Starting transcription creates a dedicated Worker. MediaBunny decodes the recording in bounded windows and Whisper Tiny q8 transcribes 16 kHz mono PCM through single-threaded ONNX WebAssembly. Auto detect splits at quiet pauses and uses Whisper's first language-token prediction before transcription, adding a model pass per segment. The Worker returns cues with original recording timestamps for seeking and SRT output. TXT contains only the cue text. Captions accompany the original recording and may require timestamp adjustments if the video is trimmed separately.

The Worker fetches the pinned speech model and initializes its runtime on demand. Browser storage retains these assets for later offline sessions. **Clear downloaded model** removes the speech cache. Recordings and caption text stay in the browser. Caption edits exist in memory and survive app navigation within the recording session. A running job or unsaved caption output holds an application update guard until the job is canceled or the output is downloaded.

Run `python -B scripts/browser_smoke_transcription.py --browser chromium --long` after `npm run build` to exercise actual bilingual recognition and an offline browser restart. The opt-in check requires Playwright, FFmpeg, and network access to fetch the initial model and public speech fixtures.

## Draft and Storage Ownership

`EditorDraftProvider` remains mounted above the recorder/converter page switch. It retains segments, selected segment, bounded undo history, playhead and export settings during navigation. Its versioned local-storage draft saves the retained segments, selection and export settings under the persisted recording identity. Undo history, playhead, preview playback and export jobs remain session state. Reload restores a validated draft for the same recording. An invalid draft blocks trimmed export until **Reset Trim** is confirmed. Full export and the original download remain available. Replacing or successfully clearing the recording clears its associated draft.

`useVideoSession` owns the current recording URL and metadata finalization. It awaits IndexedDB transaction completion before finishing a save or deletion. Failed saves still open the in-memory recording in the editor, with a persistent localized warning and an original-video backup link. Failed deletion retains the video and draft so an undeleted recording is not silently discarded. Database failures are surfaced and initialization can be retried.

The current recording slot is shared per origin. Each saved recording has its own identity, and an existing record receives one the first time it is restored. **Record New** compares that identity with the current slot in the same transaction as deletion. A stale editor keeps its draft and original download while displaying the conflict. Legacy recordings remain viewable and downloadable if the identity write fails.

`useExportOperation` and `ExportTaskScope` own each UI export. Unmount, cancellation, file replacement and a new export invalidate the previous task. Late results cannot allocate a URL for a stale operation. The converter stays mounted outside the recording-keyed draft provider. A completed converter output holds an update-protection lease until download is requested or the result is discarded.

`TaskActivity` leases span permission prompts, recording, exports and storage operations. PWA reload confirmation is disabled while any lease is active, and the service-worker controller checks the same state at activation. Activation by another tab only prompts this tab; it never forces an active job to reload.
