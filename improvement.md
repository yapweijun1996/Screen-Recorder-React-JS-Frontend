# ScreenClip Pro Improvement Roadmap

Reviewed at `b284cb6ff4928cf579ec120092fa3d027d6e92d9`. The sections retain their baseline findings and record the shipped changes and remaining verification. See the [feature map](FEATURES_MAP.md) for current workflows and the [browser test results](docs/BROWSER_VERIFICATION.md) for verified platform behavior.

## Recommended order

| Order | Improvement | Priority | Effort | Why now |
| --- | --- | --- | --- | --- |
| 1 | Protect the current recording across tabs | High | Medium | An editor showing an older recording can delete the newer saved recording. |
| 2 | Make conversion and editing keyboard-accessible | High | Medium | Keyboard users can be blocked at file selection, and editor shortcuts can override focused controls. |
| 3 | Run regression checks before publishing | High | Small | The Pages workflow builds and publishes without running the project's typecheck or test suite. |
| 4 | Explain which export formats are available | High | Medium | The header reports the video encoder, while export success depends on the source's audio and selected container. |
| 5 | Verify capture, conversion and recovery across browsers | High | Medium | Existing browser evidence is concentrated on Chromium with synthetic capture. |
| 6 | Make editor preview and visual cues reliable | Medium | Medium | Manual seek and sequence preview can conflict, and the timeline draws decorative bars unrelated to source audio. |
| 7 | Preserve editor drafts through reloads | Medium | Medium | Reload and app updates restore the original recording but reset edits. |
| 8 | Measure and bound long exports | Medium | Large | Decoded samples are bounded, while frame planning and compressed output still grow with export length. |
| 9 | Clarify installability and offline behavior | Low | Medium | Install support depends on browser and platform, with known manifest and icon gaps. |

Effort is relative to this repository and includes verification. Items 1, 2 and 3 have independent ownership boundaries. Start the browser checks alongside them, then use the verified recording identity contract from item 1 to scope draft persistence.

## 1. Protect the current recording across tabs

**Status.** Implemented. Chromium confirmed that an existing legacy recording receives an identity, a stale reset preserves the replacement and exposes the original download, and a reset with the matching identity still clears the slot.

**Evidence.** The store uses one constant key for the current recording. The editor restores an object URL and duration into its own tab state. **Record New** deletes the slot without comparing it with the recording loaded by that editor. In Chromium, tab A loaded one WebM fixture. The same-origin tab B then stored a newer record directly in IndexedDB. Clicking **Record New** in tab A removed the newer record. [IndexedDB record key](src/services/videoStorageService.ts#L4) · [Restore and reset](src/components/useVideoSession.ts)

**Change.** Give each saved recording an identity. Compare that identity and delete within a single IndexedDB transaction. On mismatch, retain the newer record and surface a localized message. Define how existing records receive an identity and keep the original download path available while handling storage errors.

**Acceptance.** With two tabs on the same origin, load A in one tab, save B in the other, and invoke **Record New** in the first. B remains recoverable after reload. Same-record reset deletes normally and transaction abort still preserves the active recording and draft.

## 2. Make conversion and editing keyboard-accessible

**Status.** Implemented. Chromium confirmed native file browsing with Tab, Space and Enter, native activation of the focused reset button, keyboard seeking and both trim edges, and an export dialog that focuses Cancel and returns focus to the export button after Escape.

**Evidence.** The converter uses a clickable generic container around a hidden file input. Chromium Tab navigation skipped it. In the editor, Chromium reported that the Space key was prevented while **Record New** was focused. Timeline trim handles and the playhead use pointer interactions. [File chooser](src/components/Converter.tsx#L73) · [Editor key listener](src/components/editor/useKeyboardShortcuts.ts#L65) · [Trim handles](src/components/editor/TimelineClip.tsx) · [Playhead](src/components/editor/DraggablePlayhead.tsx)

**Change.** Provide a focusable native browse button alongside drag-and-drop. Scope editor shortcuts to the editor surface and yield to actionable controls and text entry. Give trim and playhead actions keyboard equivalents and localized accessible names. Localize the active timeline actions and shortcut legend. Give export progress predictable focus and a keyboard-reachable Cancel action. [Timeline actions](src/components/editor/TimelineActions.tsx) · [Export progress overlay](src/components/editor/ExportProgressModal.tsx)

**Acceptance.** Browse a file using Tab and Enter or Space. Activate focused editor buttons with Space. Trim, seek, and cancel export through a keyboard-only path. Verify focus order, announced names and shortcuts when focus is on the timeline or inside a text field.

## 3. Run regression checks before publishing

**Status.** Implemented in `945fdbf`. Pull requests and main builds run TypeScript, Node tests and the production build. Pages publishes the verified build artifact from main. The workflow completed successfully on GitHub.

**Evidence.** The deployment workflow runs `npm ci` and `npm run build` before uploading Pages assets. The project already exposes `test` and `typecheck` scripts. [Pages workflow](.github/workflows/deploy.yml) · [Package scripts](package.json)

**Change.** Add a verification job on pull requests and the publish branch. Require typecheck, the existing Node suite and a production build before deploying. Reuse the tested build artifact and keep Pages publishing permissions with the publish workflow.

**Acceptance.** A failing test or type error prevents artifact publication. A passing change yields the same build that the deploy job uploads. Verify the workflow with a failing check and a passing case before relying on it as a gate.

## 4. Explain which export formats are available

**Status.** Implemented in `dc49d1f`. The format decision uses the requested container and source tracks. Browser checks confirmed MP4 and WebM outputs, exact track codecs, damaged input rejection, and picker and drop entry points. Firefox preserved Opus in WebM when AAC output encoding was unavailable.

**Evidence.** The header reports a video encoder. The coordinator checks the source's audio track and four codec flags to choose an MP4, WebM or audio-only path. Many failures share a generic error. The converter accepts `video/*` in the picker, lists MKV in its hint, and sends dropped files to export without input validation. [Status badge](src/components/EngineStatus.tsx) · [Codec negotiation](src/services/webcodecs/webcodecExportService.ts) · [Error mapping](src/services/webcodecs/exportErrors.ts) · [Converter input](src/components/Converter.tsx)

**Change.** Expose the coordinator's available choices and fallback reasons in the editor and converter. Distinguish an unreadable local file, an unavailable codec combination and audio decoding failure. Align chooser hints with tested inputs and use the same local check for picker and drop. Treat extensions and MIME as hints and keep source decoding as the authority.

**Acceptance.** Exercise H.264/AAC, VP8/Opus, a silent source, an audio-bearing source with a missing encoder, and a damaged file. The chosen format, fallback message and output bytes agree. Picker and drop handle the same fixtures, including one with an empty MIME type.

## 5. Verify capture, conversion and recovery across browsers

**Status.** Automated production coverage is available for Chromium, Firefox and bundled Windows WebKit. Real screen pickers, camera, microphone, Apple Safari and background picture-in-picture remain pending. The automated profiles kept both test tabs visible when switched, so they could not verify hidden-tab throttling.

**Evidence.** The release record covers Chromium with synthetic recording and injected errors. Physical screen selection, camera and microphone behavior, Firefox and Safari remain unverified. Capture, installability, input decoding and output codecs rely on different browser APIs. [Release verification](task.md) · [Capture entry](src/components/recorder/useRecorderController.ts) · [Capability detection](src/services/webcodecs/capability.ts)

**Change.** Keep a small production-build smoke suite with deterministic fixtures. Record per-browser and per-platform results for screen capture, screen audio availability, microphone and camera, input decoding, MP4/WebM/audio export, recovery and offline loading. Include hidden-tab PIP testing. The compositor drives its canvas with document animation frames, so background throttling is a risk that still needs device reproduction. Require a small manual device pass for real permissions and screen sharing before expanding compatibility claims. [Compositor](src/utils/StreamCompositor.ts)

**Acceptance.** Automated tests cover failure and completion for recording, editing and conversion on supported browser engines. The manual matrix records browser version, OS, capture source and tested output. Record a moving fixture for 30 seconds with the recorder tab hidden, compare PIP and direct capture, and check for frame gaps or frozen intervals. Validate downloaded media tracks and container bytes in addition to the UI. If freezing reproduces, benchmark a compositor independent of the visible tab before changing the capture pipeline. [Current compatibility claims](README.md)

## 6. Make editor preview and visual cues reliable

**Status.** Implemented in `293b8ee`. Manual seeking exits sequence preview through a shared command. Chromium and Firefox confirmed that a ruler click during preview selects the later clip and continues playing at the requested source time. Decorative waveform bars were removed.

**Evidence.** The playhead and ruler pass through a seek handler that retains the active preview index. The subsequent time update can advance the old preview index and seek again. The player seek bar clears that index explicitly. The timeline clip bars are generated with a deterministic formula that does not read the recording's audio. These findings are source-backed. [Preview progression and seek](src/components/editor/useEditorPlayback.ts) · [Seek callers](src/components/Editor.tsx) · [Decorative bars](src/components/editor/TimelineClip.tsx#L40)

**Change.** Give manual seeking a single command that exits sequence preview and seeks in source time while preserving the intended play or pause state. Remove any suggestion that the current bars represent audio. Consider real waveform rendering after measuring decode cost. Update old editor design notes against the mounted timeline and inspector before cleaning up unused views. [Earlier design notes](REVIEW_AND_PLAN.md)

**Acceptance.** With two retained clips separated by a gap, choose **Preview Selection** and click inside the later clip. Playback continues from the clicked position without snapping to the later clip's start. Dragging the playhead and seeking from the player follow the same behavior. If a waveform is introduced, verify that silence and a known tone produce different, time-aligned displays.

## 7. Preserve editor drafts through reloads

**Status.** Implemented in `293b8ee`. A versioned recording-scoped draft retains segments, selected clip and export settings. Browser tests covered reload, confirmed Chromium update, and corrupt draft protection. Undo and playhead state last through in-app navigation.

**Evidence.** The draft provider keeps edits during switching between recorder and converter. Its reducer and settings are in memory, while storage persists the original recording. Reload and the confirmed PWA update therefore lose draft edits. [Draft provider](src/components/editor/EditorDraftContext.tsx) · [Lifecycle](src/App.tsx#L139) · [Update behavior](docs/PWA.md)

**Change.** After stable recording identity is available, store a small versioned draft keyed to that recording. Start with retained segments, selection and output settings. Decide whether to include playhead and undo history based on tested recovery behavior and payload limits. Keep the original usable if draft storage fails.

**Acceptance.** Reload and a confirmed app update restore the draft for the same recording. Record New and replacement capture leave no draft attached to the wrong recording. Old or invalid draft data cannot replace the original or expand an edited export to include discarded footage.

## 8. Measure and bound long exports

**Status.** Partially implemented in `dc49d1f`. The production encoder consumes frame deadlines lazily. The timing and frame bounds match the baseline planner. In a Node planner-only comparison for 216,000 deadlines, post-GC retained heap dropped from 22.75 MiB to 0.04 MiB and iteration plus planning took about 102 ms versus 18 ms. The sampled heap increase during this run was 35.78 MiB versus 31.90 MiB. These figures exclude decoders, encoders and muxers. Full media exports across longer runs, resolutions and browsers still need end-to-end memory, timing and cancellation measurements. Encoded output remains in memory.

**Evidence.** The video planner allocates an entry for each output frame. MP4 and WebM muxing use in-memory targets, and video MP4 enables in-memory fast start. Existing tests protect decoded-block and encoder-queue bounds. They provide no general bound for deadline objects or complete output bytes. [Frame plan](src/services/webcodecs/exportTimeline.ts#L29) · [Mux targets](src/services/webcodecs/webcodecExportService.ts) · [Current limits](docs/EXPORT_PIPELINE.md)

**Change.** Benchmark representative durations, resolutions and rates on the supported browser matrix. Start with lazy deadline iteration if it materially lowers memory. Evaluate a file-backed mux target separately, with a compatible download path where direct file output is unavailable. Preserve precise cut boundaries, audio, cancellation and local-only processing.

**Acceptance.** Compare peak memory, export completion time and cancel latency on the same fixtures before and after each change. Verify exact short-clip output, long-export frame coverage, audio/video timing, and cleanup of partial output when the job is cancelled.

## 9. Clarify installability and offline behavior

**Status.** Manifest identity, platform icons and offline guidance shipped in `6212c70`. The browser smoke suite verified the project subpath and cached reload in three engines. Chromium verified update blocking during capture. Launch from an installed system icon on supported devices remains pending.

**Evidence.** The manifest and HTML reference SVG icons and the app relies on the browser's installation controls. The app precaches built assets and implements a guarded update flow. The project PWA notes list installation and icon gaps. [Manifest and precache](vite.config.ts#L17) · [Apple touch icon](index.html) · [PWA checklist](docs/PWA.md)

**Change.** Verify installation at the hosted project subpath before choosing a stable manifest ID and platform icons. Document browser-specific installation entry points and the difference between a cached revisit and the first offline visit. Retain the existing rule that active recording, export and storage block application-controlled reloads.

**Acceptance.** Install from the hosted subpath, launch from the system icon, reopen after a successful cache fill with the network disabled, and exercise an update during active work. Document the behaviors observed on each browser and device.

## Review verification

The review baseline passed 124 Node tests and TypeScript checking. The shipped production code passed 137 Node tests, strict TypeScript and the production build. [Reproducible browser verification and device checklist](docs/BROWSER_VERIFICATION.md).
