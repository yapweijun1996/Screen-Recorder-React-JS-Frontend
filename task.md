# Task Log

Running log of meaningful changes to ScreenClip Pro. Structured records live in [task.jsonl](task.jsonl) (one JSON object per line, append-only, easy to grep/`jq`).

Newest first.

---

## 2026-11-19 — Add MP3 selection, protect conversions and show PWA build versions

- The converter offers MP4 video and MP3 audio. In-app surface switches retain the active job, selected file and pending output. Cancelling a job or discarding a result before download requires confirmation. An undownloaded result blocks app-controlled reload.
- FFprobe identified an audio-only MP3 from the original recorded WebM. The browser smoke suite checks real MP3 downloads and a missing-audio error from silent input.
- The recorder and converter footers sit at the viewport bottom when content is short. They display the running build and provide **Check for updates**. The waiting worker supplies the target build ID shown on **Update and reload**.
- Chromium verified an update between two independently built versions, including the blocked state until a conversion download was requested. [Browser checks](docs/BROWSER_VERIFICATION.md)

---

## 2026-11-19 — Repair streamed WebM conversion and refine editor controls

- Reproduced a converter failure on a screen recording with VP9 video, Opus audio and no declared WebM duration. Sparse lookup missed target timestamps that presentation-order decoding could read. The streaming path now samples real decoded frames with bounded lookahead, preserving the audio tail and explicit decoder failures. The original recording stayed local and was excluded from the repository.
- In Chromium, the original failure case produced a 1920×1080 MP4 with 8,600 H.264 frames, AAC audio and a 286.656-second duration. FFprobe verified the downloaded file.
- TypeScript, 140 Node tests and the production build passed. The streamed WebM fixture produced H.264/AAC in Chromium and VP8/Opus in Firefox. Bundled Windows WebKit retained its unsupported-conversion result.
- The Play/Pause action moved next to the timecode beneath the video. **Record New** uses the shared red danger treatment. Converter feedback uses semantic theme colors. Chromium validated playback with Space and Enter, reset protection across tabs, and error and warning contrast in both themes.
- The six-viewport UI review and deferred tasks are recorded in the [UI/UX backlog](improvement.md#uiux-audit-and-parallel-backlog).

---

## 2026-11-19 — Ship recording protection, draft recovery and verified export

**Status.** Code shipped to `main`. Device verification and full long-export profiling remain open in the [improvement roadmap](improvement.md).

- `945fdbf` added typecheck and tests to the Pages build gate. `6212c70` added the stable PWA identity and platform icons.
- `293b8ee` added the recording identity check, keyboard and preview changes, and validated editor drafts. `dc49d1f` completed the converter keyboard flow and added codec-aware selection, sound-preserving WebM fallback and lazy frame planning.
- Verified 137 Node tests, TypeScript and the production build. The [browser smoke suite](docs/BROWSER_VERIFICATION.md) checked Chromium and Firefox capture and editor paths, downloaded media tracks, Windows WebKit's unsupported export response, and cached reload on all three engines.
- A planner-only run retained 0.04 MiB after GC while iterating 216,000 deadlines, compared with 22.75 MiB for the baseline eager planner. Chromium and Firefox matched the baseline frame counts on the 30- and 60-second fixtures, with browser-dependent memory results. Compressed export output remains in memory. [Performance sample](docs/BROWSER_VERIFICATION.md#export-timing-and-memory-sample)

---

## 2026-11-19 — Fix capture, timeline, export, and preference reliability

**Status:** implemented and verified locally. [Bug register](bug.md) · [Feature map](FEATURES_MAP.md)

- Fixed all ten registered bugs. The editor protects the last retained clip, shares its delete command and timeline coordinates, adds Hand panning with H and Select with A, and keeps reverse shuttle inside the selected clip.
- Capture locks controls during stop, reports MediaRecorder interruption, and rejects failed screen or camera playback. Suspended audio startup has a bounded resume wait. Localized footer copy describes camera picture-in-picture.
- Converter output labels reflect the actual MP4 or WebM result. Exceptional codec probes can retry, audio flush has an abortable inactivity deadline, and theme and language can be used when browser storage is denied.
- Verification included 124 passing Node tests, strict TypeScript, a production PWA build and Chromium UI checks. Browser checks covered capture cleanup and editor handoff, camera startup rejection, audible synthetic PIP recording, timeline deletion, zoom and pan, reverse shuttle bounds, preference storage denial, MP4 and WebM container bytes and downloads, transient codec retry, and stalled audio flush.
- Limits include physical capture devices and system share pickers, Firefox and Safari. The production build reports outdated Browserslist data and a main chunk just above the 500 kB warning threshold.

---

## 2026-11-19 — Parallel audit of capture, editor, and export

**Status:** audit complete. Findings and proposed repairs are tracked in [bug.md](bug.md).

- Three parallel reviews covered the capture and storage lifecycle, timeline editing, and Converter and WebCodecs paths at `c378c1e`. The consolidated register contains 10 open bugs, five scoped refactoring candidates, and two follow-up verification items.
- Highest priority: prevent Delete or Backspace from restoring excluded footage when one clip remains, and distinguish interrupted recording from successful capture. The prior **Delete selection** route refers to an unmounted panel. The active shortcut route was reproduced.
- The baseline suite passed 108 tests and TypeScript checks in an isolated checkout during the initial review. Focused harnesses exercised the active deletion shortcut, the zoomed playhead, partial recorder output, preference-storage denial, audio flush stalling, and capability retry. The stop/pause API behavior was checked in Chromium. Full app browser flows and real capture devices remain unverified.
- Suggested implementation order: fix the last-clip command and recording terminal handling, then make timeline coordinates consistent and bound audio flush waits. Apply localized refactoring with each fix and verify the affected user path.

---

## 2026-10-08 — Accurate video sampling, encoder failures and aspect-preserving export

**Status:** implemented and verified locally.

- Replaced 16x HTML playback sampling with lazy Mediabunny video samples at requested source timestamps. Source rotation/display aspect is respected; current samples, frames, decoder iterators and inputs are released on success, failure, timeout and cancellation, including late samples and stalled iterator cleanup.
- Video encoding waits at four pending inputs, yields regularly, propagates every encoder/muxer error, and verifies distinct output timestamps plus complete frame output after flush. Quota errors never restart an encoder that discarded frames. MP4 duration metadata comes from the shared cut timeline.
- Resolution presets fit the source orientation and aspect ratio, with even encoder dimensions and contain drawing. 720p examples: landscape 1280×720, portrait 720×1280, 4:3 960×720.
- Verification: 87 regression tests, strict TypeScript, final production build and diff checks passed. Native Chromium decoded and encoded all 240 distinct source frames of a 4-second 60fps fixture, compared with only 16 captured frames before the fix. Native terminal-frame quota injection rejected with the original QuotaExceededError; the production page displayed failure without a success download. Portrait MP4/WebM retained audio and exported at 720×1280. Native VP9 MediaRecorder WebM converted successfully; cancellation rejected about 1 ms after abort. ffprobe measured two 0.501-second cuts as 1.001997 seconds (62 video frames), and the production converter produced a 180×320 H.264 video with AAC audio. Final production resources were activated through the idle PWA update flow and conversion succeeded.
- Limits: browser/container decoder support remains required. AAC priming/padding persists (the 1-second test produced 1.066667 seconds of audio). MP4 sample-table duration inference and WebM's missing per-frame duration can differ from the final container endpoint by one frame; packet-based duration calculations may therefore differ from player/ffprobe track duration. Compressed output, deadlines and indexes still grow with duration. Actual capture devices, Firefox/Safari and native download completion remain untested. The build retains the existing stale Browserslist-data warning.
- Reusable lesson retained in project documentation: validate source-frame content as well as output frame count, propagate asynchronous codec failures, and compare packet and container/player timing when testing partial final frames.

---

## 2026-10-07 — Shared cut timeline, streamed audio and safe PWA updates

**Status:** implemented and verified locally.

- Audio and video now use one cumulative cut timeline, clipped to source duration. Video ends each cut with its exact remaining frame duration; audio rounds cumulative sample positions once. Invalid FPS is rejected rather than entering an unbounded planner loop.
- Replaced whole-file/whole-track audio decoding with lazy Mediabunny input and selected-range audio samples. PCM copies are limited to 4096 frames, with at most four pending encoder inputs and regular event-loop yields. Abort disposes the input, cancels reads/queues and closes native decoders. The dependency is loaded as a separate export chunk; MPL-2.0 license and a corresponding source-archive notice are included in the build and PWA precache.
- PWA workers wait for an explicit update confirmation. Localized reload controls are disabled during permission prompts, recording, export and storage work. A controller change caused by another tab, or new work starting during activation, cannot force a busy tab to reload. Registration, visibility listeners and timers are cleaned up on unmount.
- Verification: 61 regression tests, strict TypeScript, production build and diff checks passed. Native browser export plus ffprobe confirmed 20 × 0.501-second cuts produce exactly 10.020000 seconds of video. Single-cut and twenty-cut AAC tracks both measured 10.090667 seconds, confirming the residual is fixed codec padding rather than cumulative cut drift. A real one-hour stereo Opus source exported to AAC in about 22.4 seconds: 180001 PCM blocks, maximum copy 7680 bytes, no whole-file arrayBuffer read. A second run rejected with AbortError about 0.3 ms after cancellation. Final production UI conversion succeeded; a real waiting worker was blocked during a simulated permission wait, then activated/reloaded after idle confirmation. A subsequent built worker triggered the updatefound/waiting banner and activated the final application chunk.
- Limits: AAC output retains platform codec priming/padding (about 71–77 ms in these samples). Compressed mux output, frame deadlines and container metadata still grow with duration. Actual capture devices and Firefox/Safari remain untested. The build retains the existing stale Browserslist-data warning. Native download completion is unverified; encoded Blob contents and download links were checked directly.

---

## 2026-10-07 — Draft retention, export lifecycle and committed storage

**Status:** implemented and verified locally.

- Retained recording-scoped segments, selection, undo history, playhead and export settings above page navigation. New recordings and successful reset start fresh drafts; refresh still restores only the original recording. Segment mutations update edit/history atomically.
- Shared export task ownership now aborts on unmount, cancellation and replacement, isolates progress callbacks and prevents late result URLs. Media metadata/readiness/seeks and frame playback have error, abort and inactivity timeout handling. Native audio decode/encoder flush waits cancel promptly; the underlying native audio decode may still finish in the background.
- IndexedDB operations resolve only after transaction completion and reject request/transaction errors or aborts. Failed initialization can retry. Recording finalization now awaits its metadata and save path; save failure keeps the video available with a persistent localized warning and original backup link. Failed deletion preserves the recording and draft.
- Verification: 44 regression tests, strict TypeScript and production build passed. Browser tests with synthetic sources confirmed draft/settings/playhead/undo retention across navigation, fresh defaults for a new recording, committed storage reads, save and delete failures after request success, original Blob readability, editor cancel, converter unmount cancel, successful conversion after retry, no late result URL and complete task URL cleanup. A 17.47-second H.264 MP4 at 320×180/60fps was generated and inspected with ffprobe.
- Limits: native download-event wait did not complete in the in-app browser; the backup Blob and filename were verified directly. Actual devices and Firefox/Safari were not tested. Build retains the existing stale Browserslist-data warning.

---

## 2026-10-07 — Recording cleanup and truthful export settings

**Status:** implemented and verified locally.

- `RecordingSession` owns raw screen/microphone/camera streams and the final stream. Completion, empty output, startup failure and unmount release all resources. Permission or composition results returned after disposal are immediately released; late finalization is ignored.
- Audio decode failure now distinguishes confirmed silent MP4/WebM files from audio-bearing or unknown files. Unsafe silent exports are blocked with translated messages in both editor and converter.
- Removed CRF UI, state, preset values and `ExportOptions.crf`; quality presets continue to drive bitrate.
- Split export phases and editor playback into focused modules to keep changed source files at or below 300 lines.
- Verification: `npm test` passed 22 tests; TypeScript and production build passed. Four generated MP4/WebM fixtures correctly distinguished audio-bearing and silent media. Browser tests with synthetic sources verified navigation/unmount cleanup, normal stop, late capture results, a 69.67-second MP4 retaining stereo audio, visible decode-failure messages in both UIs, silent-video conversion and removal of CRF controls/text.
- Limits: actual device permission dialogs and Firefox/Safari were not tested. Build retains the existing stale Browserslist-data warning; locked muxer packages also emit upstream deprecation notices.

---

## 2026-05-12 — Relicense to MIT

**Status:** ✅ shipped (this commit)

Project is now open source under the **MIT License**. Anyone may use, copy, modify, merge, publish, distribute, sublicense, or sell copies, provided the copyright notice and license text are preserved. No commercial-license negotiation needed.

- [LICENSE](LICENSE) rewritten from proprietary "All Rights Reserved" to standard MIT
- [package.json](package.json): `"license": "MIT"`
- [README.md](README.md): License section + Project Status updated to reflect open-source positioning, contributions welcome

Why the change: the project is being treated as a portfolio piece, not a paid product. MIT is the simplest path to maximum reach and lets the WebCodecs streaming pattern + PWA techniques benefit other engineers freely.

---

## 2026-05-12 — Cancellable export

**Status:** ✅ shipped (`d58205d`)

Users can now stop a running export from the progress modal.

- [`webcodecExportService.ts`](src/services/webcodecs/webcodecExportService.ts) accepts an optional `AbortSignal`. `throwIfAborted(signal)` checkpoints are scattered through the pipeline (post-source-open, post-audio-decode, per rVFC frame, per seek-fallback iteration, tail flush loop, audio segment loop, pre-flush, pre-finalize). The rVFC playback Promise also installs an `abort` listener so cancellation is responsive even mid-frame.
- On abort the `catch` block independently closes `prevBitmap`, both encoders (guarded by `state !== 'closed'`), and releases the source `<video>` + object URL, then re-throws `DOMException('Export cancelled', 'AbortError')`.
- [`useEditorExportController.ts`](src/components/editor/useEditorExportController.ts) creates a fresh `AbortController` per export, exposes `cancelExport()`, and treats `AbortError` as a silent dismissal (no error banner).
- [`ExportProgressModal.tsx`](src/components/editor/ExportProgressModal.tsx) renders a **Cancel export** button when an `onCancel` callback is supplied.
- Translation key `editor.export.cancel` added in all 10 locales.

Docs: see the **Cancellation** section in [docs/EXPORT_PIPELINE.md](docs/EXPORT_PIPELINE.md).

---

## 2026-05-12 — Use relative base path everywhere

**Status:** ✅ shipped (`d15e447`)

Dropped the `mode === 'production' ? './' : '/'` branch in [`vite.config.ts`](vite.config.ts) and always use `base: './'`. Simpler config, and module asset URLs resolve correctly whether the app is served from a subpath (GitHub Pages project site) or the root. PWA `start_url` and `scope` also become `./`.

---

## 2026-05-12 — Streaming WebCodecs export

**Status:** ✅ shipped (`f84e894`)

Rewrote [`src/services/webcodecs/webcodecExportService.ts`](src/services/webcodecs/webcodecExportService.ts) from a seek-per-frame demux into a streaming `requestVideoFrameCallback` pipeline.

- **Before:** 38 s clip → ~40 minutes export on Chrome, multi-GB RAM peak
- **After:** 38 s clip → ~3 s export, ~50 MB constant RAM
- **How:** `<video>.playbackRate = 16` + `requestVideoFrameCallback` drives a 2-bitmap rolling buffer; each captured frame feeds into `VideoEncoder` inline via nearest-neighbour deadline matching, then the `VideoFrame` is closed immediately
- **Fallback:** old seek-based path retained for browsers without `requestVideoFrameCallback`

Docs: [docs/EXPORT_PIPELINE.md](docs/EXPORT_PIPELINE.md)

---

## 2026-05-12 — PWA 2026 standards compliance

**Status:** ✅ shipped (`1ff19b9`)

- Added `viewport-fit=cover` + `mobile-web-app-capable` meta tags ([`index.html`](index.html))
- Added `env(safe-area-inset-*)` body padding + landscape floor for iPhone notch/home-indicator ([`src/index.css`](src/index.css))
- Replaced silent `autoUpdate` with custom [`registerSW.ts`](src/registerSW.ts) that force-reloads on new SW + polls hourly + re-checks on `visibilitychange`
- Added `vite-plugin-pwa/client` types to [`src/vite-env.d.ts`](src/vite-env.d.ts)

Docs: [docs/PWA.md](docs/PWA.md)

---

## 2026-05-12 — Legacy v1 code removal

**Status:** ✅ shipped (`1ff19b9`)

Deleted root-level v1 React app:

- `App.tsx`, `index.tsx`, `index.css`, `types.ts` (root duplicates)
- `components/Button.tsx`, `components/Editor.tsx`, `components/RangeSlider.tsx`, `components/Recorder.tsx`
- `services/ffmpegService.ts`
- `utils/StreamCompositor.ts`, `utils/format.ts`

Net: **-1259 / +69 lines**. Live entry has been `src/index.tsx` for some time; root files were stale duplicates that still referenced GPL FFmpeg.

Also:

- Dropped "FFmpeg.wasm" from all 9 non-English locale footers
- Renamed `VideoQualityConfig.ffmpegPreset` → `encoderPreset`
- Updated `metadata.json` description to mention WebCodecs instead of WebAssembly

---

## 2026-05-12 — Commercial licensing prep

**Status:** ✅ shipped (`7d4ba16`)

- **Removed GPL `ffmpeg.wasm` binaries** from `public/ffmpeg/` and `public/ffmpeg-mt/` (~64 MB of `.wasm` + JS shims). Already replaced with WebCodecs + MIT muxers in earlier commit `562e118`, but the binaries were still shipped in `dist/`.
- Added proprietary [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Set `"license": "SEE LICENSE IN LICENSE"` in [package.json](package.json)
- Fixed Chrome `MediaRecorder` WebM `duration = Infinity` quirk in [`webcodecExportService.ts`](src/services/webcodecs/webcodecExportService.ts) (seek-to-large-number trick before reading duration)

---

## Pending / Backlog

| Priority | Task | Notes |
| --- | --- | --- |
| 🟢 P2 | `beforeinstallprompt` install button | Big install-rate lever |
| 🟢 P2 | Dedicated `offline.html` | Currently falls back to cached `index.html` |
| 🟢 P2 | Remove dead `ffmpeg.*` / `engine.ready.*` i18n keys | Harmless but confusing for translators |
| 🟢 P2 | Sentry / error monitoring for commercial deploy | |
| 🟢 P2 | Brand / white-label config via env vars | For multi-customer resale |

See also [REVIEW_AND_PLAN.md](REVIEW_AND_PLAN.md) for editor UI/UX roadmap.
