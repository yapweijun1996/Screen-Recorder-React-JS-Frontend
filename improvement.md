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

**Status.** Partially implemented in `dc49d1f`. The production encoder consumes frame deadlines lazily. The timing and frame bounds match the baseline planner. In a Node planner-only comparison for 216,000 deadlines, post-GC retained heap dropped from 22.75 MiB to 0.04 MiB and iteration plus planning took about 102 ms versus 18 ms. The sampled heap increase during this run was 35.78 MiB versus 31.90 MiB. These figures exclude decoders, encoders and muxers. A production comparison also verified exact frame counts and responsive cancellation with 30- and 60-second silent fixtures on Chromium and Firefox. Process memory results varied by browser and input. Encoded output remains in memory. [End-to-end results](docs/BROWSER_VERIFICATION.md#export-timing-and-memory-sample)

**Evidence.** The video planner allocates an entry for each output frame. MP4 and WebM muxing use in-memory targets, and video MP4 enables in-memory fast start. Existing tests protect decoded-block and encoder-queue bounds. They provide no general bound for deadline objects or complete output bytes. [Frame plan](src/services/webcodecs/exportTimeline.ts#L29) · [Mux targets](src/services/webcodecs/webcodecExportService.ts) · [Current limits](docs/EXPORT_PIPELINE.md)

**Change.** Benchmark representative durations, resolutions and rates on the supported browser matrix. Start with lazy deadline iteration if it materially lowers memory. Evaluate a file-backed mux target separately, with a compatible download path where direct file output is unavailable. Preserve precise cut boundaries, audio, cancellation and local-only processing.

**Acceptance.** Compare peak memory, export completion time and cancel latency on the same fixtures before and after each change. Verify exact short-clip output, long-export frame coverage, audio/video timing, and cleanup of partial output when the job is cancelled.

## 9. Clarify installability and offline behavior

**Status.** Manifest identity, platform icons and offline guidance shipped in `6212c70`. The browser smoke suite verified the project subpath and cached reload in three engines. The published Pages manifest and its three icons responded successfully under the hosted project subpath. Chromium verified update blocking during capture. Launch from an installed system icon on supported devices remains pending.

**Evidence.** The manifest and HTML reference SVG icons and the app relies on the browser's installation controls. The app precaches built assets and implements a guarded update flow. The project PWA notes list installation and icon gaps. [Manifest and precache](vite.config.ts#L17) · [Apple touch icon](index.html) · [PWA checklist](docs/PWA.md)

**Change.** Verify installation at the hosted project subpath before choosing a stable manifest ID and platform icons. Document browser-specific installation entry points and the difference between a cached revisit and the first offline visit. Retain the existing rule that active recording, export and storage block application-controlled reloads.

**Acceptance.** Install from the hosted subpath, launch from the system icon, reopen after a successful cache fill with the network disabled, and exercise an update during active work. Document the behaviors observed on each browser and device.

## Review verification

The review baseline passed 124 Node tests and TypeScript checking. The shipped production code passed 137 Node tests, strict TypeScript and the production build. [Reproducible browser verification and device checklist](docs/BROWSER_VERIFICATION.md).

## UI/UX audit and parallel backlog

**Result.** Desktop layouts have clear primary actions and useful separation between capture setup, video preview, timeline and export. The tested build has narrow-screen reflow failures, insufficient light-theme feedback contrast and interaction gaps. The current evidence does not establish WCAG 2.2 AA or full PWA conformance.

Reviewed the complete KB-MCP Agent Skills registry for applicable guidance. The primary audit used `ui:ux-quality-auditor` 1.0.5. The review also used `ui:design-taste-engine` 1.0.1 for visual hierarchy, `ui:navigation-system` 1.0.0 for navigation, `ui:design-tokens-theming` 0.2.0 for status colors and `pwa:product-standard` 1.1.0 for local-first updates. Enterprise admin layouts and redesign requirements are outside this standalone recorder's scope.

### Browser evidence

Playwright Chromium 148.0.7778.96 on Windows, using a local production build at `165de16` and disposable media. Viewports were 320×720, 390×844, 430×932, 768×1024, 1024×768 and 1440×900. Inspected capture setup, synthetic live capture, converter empty and selected states, a recovered editor fixture and a waiting update.

| Area | Observed result |
| --- | --- |
| Desktop | At 1440px, the primary capture and conversion actions were clear, with no document-level horizontal overflow. |
| Narrow layout | At 390px the capture and converter document scrolled to 631px. The header theme and language controls were outside the viewport. The editor document stayed 390px wide while clipping the player and part of the export column. The **Download Original** control extended to x=476px. |
| Live capture | Clicking **Microphone** during synthetic capture changed **Muted** to **Included in mix**. Microphone acquisition occurs during setup, so the label can describe the next settings instead of the active stream. |
| Status colors | The 12px converter fallback note measured 1.19:1 in light mode using the computed foreground and background colors. Normal-sized instructional text requires 4.5:1. |
| Update and playhead | The waiting update prompt showed no target build and the dismiss control measured approximately 14×20 CSS px at 390px. At 1440×900 the playhead line was 70px in a 95px track, ending 25px above the track bottom and 21px above the clip bottom. |

The measurements cover Chromium viewports and synthetic inputs. Real phone and tablet devices, VoiceOver and other screen readers, browser zoom and a full automated accessibility scan remain unverified. Axe-core is absent from the repository dependencies. [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) · [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

### Work packets

| ID | Priority and owner | Finding and scope | Acceptance |
| --- | --- | --- | --- |
| UX-01 | High · App shell | The single-row header overflows on phones and clips in the editor. [App header](src/App.tsx#L52) | At all six viewports, capture, converter, theme and language remain visible or reachable through an explicit control. Keyboard order and current destination are clear. The document does not scroll horizontally. |
| UX-02 | High · Editor layout | Fixed-width library and inspector squeeze the central player at 390px. [Editor layout](src/components/editor/EditorLayout.tsx#L68) | At 320–430px a usable player and essential timeline and export actions are reachable. At 768px the preview remains usable. Intentional timeline scrolling stays inside the timeline. |
| UX-03 | High · Recorder | Setup toggles can imply a live source change. Microphone and camera controls and quality choices lack programmatic selected state. [Recorder controls](src/components/recorder/RecorderSidebar.tsx#L87) · [Capture setup](src/components/recorder/useRecorderController.ts#L94) | Setup-only settings are locked during active work or clearly apply to the next recording. The active state matches actual tracks. Keyboard and assistive technology can determine settings, and supported live camera-position changes still work. |
| UX-04 | High · Converter feedback | Error, warning and result colors need semantic light/dark values. Selection state, progress and error announcements need a separate accessibility pass. Quality descriptions and Remove File text include English literals. [Converter](src/components/Converter.tsx#L124) | Error, warning and success text meets 4.5:1 for normal text in both themes. Selected quality is exposed, progress can be read without constant announcements, terminal failures have actionable localized text, and fallback guidance agrees with the actual state. |
| UX-05 | High · PWA update | Show the current and waiting build identity from release metadata tied to the actual running page and worker. The present footer label is static copy and the update button has no target version. [Update banner](src/App.tsx#L104) · [Worker update flow](src/services/serviceWorkerUpdates.ts) | On a two-build fixture, the local prompt shows the actual target build and allows one idle confirmation. Busy work stays protected, confirmation and recovery are announced, persisted trims survive reload, and clients without version metadata can still update. At 320px the button and dismissal remain reachable. |
| UX-06 | Medium · Editor playback | The large central play affordance dims and blocks the paused video. Seeking is pointer-only in the player strip. [Editor player](src/components/editor/EditorPlayer.tsx) | Keep Play/Pause beside the timecode with keyboard and touch support. The paused frame is unobstructed. A separate seek follow-up gives the progress strip a readable label and keyboard operation. |
| UX-07 | Medium · Timeline | The red playhead stops above the clip bottom because the component receives a fixed 70px height. [Playhead height](src/components/editor/ProTimeline.tsx#L211) · [Line rendering](src/components/editor/DraggablePlayhead.tsx#L76) | The line reaches the clip track bottom within 1 CSS px at minimum, default and resized heights. The marker does not enter the footer. Dragging, zoom, scrolling and the timestamp label still align. |
| UX-08 | Medium · Editor controls | Advanced export expansion and pointer-only splitters need accessible names and controls. Export progress and the split-distance hint need accessibility and locale review. [Inspector](src/components/editor/InspectorPanel.tsx) · [Resize handle](src/components/editor/ResizeHandle.tsx) · [Progress dialog](src/components/editor/ExportProgressModal.tsx) | Advanced settings expose expanded state. Keyboard and touch can resize or use an equivalent layout. Progress and errors can be read by assistive technology. The split hint follows the selected locale. |
| UX-09 | Medium · Editor controls | The **Record New** button resembles a neutral command even though it clears the current recording on success. [Editor header](src/components/editor/EditorHeader.tsx) | Use a red danger treatment with readable contrast in both themes. Existing recording identity, stale-tab protection and reset behavior continue passing. |

Run the app-shell layout, editor layout, and converter/recorder work in separate ownership scopes. Schedule the update button alongside those scopes with one owner for the shared app header and banner. Within the editor, land player controls and playhead geometry independently, then verify their integration with the responsive layout. Use the six-viewport matrix, English and a second locale, both themes, keyboard and touch, and rerun the existing [browser smoke checks](docs/BROWSER_VERIFICATION.md).

**Follow-up delivery.** UX-04 now uses [shared status colors](src/styles/statusTokens.css) for converter feedback in both themes. Chromium measured 6.84:1 for the light warning and 7.60:1 for the light error. The dark equivalents measured 12.03:1 and 11.16:1. The converter now exposes selected quality, translated details and a progressbar. Screen-reader verification remains open. The UX-06 Play/Pause control moved below the preview alongside the timecode. Chromium verified keyboard operation and an unobstructed video center. The seek control remains open. UX-09 now uses the red danger treatment with 4.83:1 text contrast, and reset and stale-tab protection passed browser checks.

**Versioned update delivery.** UX-05 now shows the running build and **Check for updates** in the footer. The reload button displays the waiting build after the worker identifies itself. Chromium verified a change between two production builds and confirmed that an undownloaded conversion blocks the update. Full phone reflow and the playhead height remain open.
