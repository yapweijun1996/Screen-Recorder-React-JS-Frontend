# ScreenClip Pro Bug Register

Original audit baseline `c378c1e9a702147ba81f9144a9227a1d504676d2`.

BUG-001 through BUG-010 are fixed. The original findings retain their baseline evidence and verification plans. **Reproduced** indicates that the stated path was exercised. **Source-confirmed** indicates that the behavior was traced in the source.

## Changes

| IDs | Resolution |
| --- | --- |
| BUG-001, BUG-003, BUG-007 | The editor shares the delete command across keyboard and toolbar, protects the last retained clip, and uses the zoomed track for playhead movement. Dragging in Hand mode pans without seeking, and H and A select Hand and Select. |
| BUG-002, BUG-009, BUG-010 | The recorder locks its controls when stopping and rejects interrupted recordings. The compositor propagates failed source playback. Audio mixing resumes a suspended context within a bounded startup wait. |
| BUG-004, BUG-006, BUG-008 | Converter download text uses the actual output and the UI discloses WebM fallback. Audio flush has a cancellable deadline. Transient probe failures can be retried while concurrent initialization remains deduplicated. |
| BUG-005 | Theme and language remain usable when browser storage is denied. Settings still persist when storage is available. |

See [task.md](task.md) for current verification results.

## Follow-up findings

| Finding | Repair and verification |
| --- | --- |
| A stale editor could delete the replacement recording saved by another tab. | `293b8ee` compares the recording identity and deletes within one IndexedDB transaction. Chromium preserved the replacement and kept the stale original available for download. |
| Manual timeline seeking during selection preview could snap to the next clip boundary. | `293b8ee` exits sequence preview before the seek. Chromium and Firefox retained the clicked source position and selected the later clip. |
| Firefox could report a successful WebM conversion with no recognized audio track. | `dc49d1f` supplies `A_OPUS` to the muxer and guards audio output. FFprobe confirmed VP8 and Opus in downloads created from both Opus and AAC inputs. |
| A streamed WebM from screen recording failed conversion with `Missing decoded video frame`. | The container lacked declared duration, and sparse timestamp lookup returned no sample from the first affected target at 1.133 seconds. Sequential decoding read all 1,510 source frames. In Chromium, the corrected download contained 8,600 H.264 frames and AAC audio at approximately the original 286.6-second duration. [Decoder path](src/services/webcodecs/exportVideo.ts) |

## Follow-up audit findings

Audit baseline `630729c29d78aa67ca9bf926fab801997b0c1a72` (2026-11-20).

BUG-014 and BUG-017 are fixed. The other findings in this section are open.

### BUG-011 — A stale PWA tab offers the active build while a newer build waits

**Priority** Low. **Evidence** Reproduced with three production builds and two tabs in Chromium 148.0.7778.96. A focused controller run also verified the messages sent to the waiting worker.

- **Reproduction.** Keep a tab running build A. Activate build B from another tab. Install build C and let its worker reach `waiting`. In the old tab, choose **Check for updates**. It reports B. Confirming the update reloads the page without sending `SKIP_WAITING` to C, so reaching C can require a second confirmation.
- **Cause.** Once `controllerChanged` is set, the manual check and confirmation choose the active controller before inspecting the waiting worker. Version notifications also suppress replies from the waiting worker in this state. [Confirmation](src/services/serviceWorkerUpdates.ts#L51) · [Manual check](src/services/serviceWorkerUpdates.ts#L118) · [Version notification](src/services/serviceWorkerUpdates.ts#L174)
- **Acceptance.** With three builds and two tabs, the old tab offers the ready C worker and a single idle confirmation loads C. Preserve the active-work guard and local confirmation for cross-tab activation.

### BUG-012 — An editor caption timestamp inside a removed range snaps back

**Priority** Medium. **Evidence** Reproduced with the production playback hook and a controlled media element.

- **Reproduction.** Keep source ranges `0–2 s` and `4–6 s`, select the first clip, and seek from a caption at `3 s`. The handler moves the media element to `3 s` and keeps the original clip selected. The next `timeupdate` resets the element to `0 s`, while the playhead state still records `3 s` for that update.
- **Cause.** Captions use original recording time and share the editor's manual seek handler. A timestamp in the gap selects no clip, so the selected-clip loop treats the timestamp as past the selected clip's end. [Caption seek wiring](src/components/Editor.tsx#L187) · [Manual seek](src/components/editor/useEditorPlayback.ts#L61) · [Selected-clip loop](src/components/editor/useEditorPlayback.ts#L100)
- **Acceptance.** From a caption timestamp inside a retained clip or removed range, the player shows the corresponding position in the original recording. Normal clip looping and edited-sequence playback continue to respect the retained ranges. [Caption behavior](FEATURES_MAP.md#editing-and-export)

### BUG-013 — Caption cleanup merges separate repeated utterances

**Priority** Medium. **Evidence** Reproduced by executing the current cue cleanup function with deterministic cue input.

- **Reproduction.** Pass `Yes` at `0–0.2 s` and `yes!` at `0.6–0.8 s` to the cleanup function. The result is one `Yes` cue spanning `0–0.8 s`, so the second spoken occurrence is absent from the editor and text downloads. Auto transcription can place separate utterances on opposite sides of a short silence boundary.
- **Cause.** Cleanup removes differences in case and punctuation and merges equal normalized text within 0.75 seconds of the previous cue's end, including non-overlapping cues. [Cue cleanup](src/services/stt/transcription.worker.ts#L78) · [Silence boundary](src/services/stt/audioWindows.ts#L134)
- **Acceptance.** Preserve separately timed repeated utterances in the editor, TXT and SRT. Add cases for short pauses, differences in case or punctuation, and genuinely duplicated overlapping output.

### BUG-014 — Draft save failures silently restore older edits after reload

**Priority** High. **Evidence** Reproduced with the production draft persistence and segment reducer using controlled local storage.

**Fix.** Draft persistence reports whether local storage accepted the write. The editor keeps failed edits in memory, preserves the previous snapshot and offers a retry. A pending save requests the browser's leave warning even after switching app views. Editing and persistence share a 1,000-clip limit. [Draft owner](src/components/editor/EditorDraftContext.tsx) · [Clip limit](src/components/editor/segmentsState.ts)

**Verification.** Chromium and Firefox preserved the last saved snapshot during an injected quota failure, requested a leave warning after switching views, and restored the latest trim after retry and reload. Node tests cover the write result and the capacity boundary. [Persistence tests](tests/editor-roadmap.test.mjs) · [Segment editing tests](tests/editor-safety.test.mjs)

- **Reproduction.** Save a draft, make another valid trim, and make `localStorage.setItem` raise `QuotaExceededError`. The save reports success, but loading returns the old range. Separately, the reducer accepted a 1,001-clip draft created by splitting a 2,001-second source. The save rejected it and loading returned the previous snapshot.
- **Cause.** The preference writer suppresses storage errors, so `saveEditorDraft` reports success after a rejected write. The draft validator caps segments at 1,000, while the reducer accepts more. The provider records the attempted snapshot as persisted without using the save result. [Preference storage](src/services/preferenceStorage.ts#L10) · [Draft validation](src/components/editor/editorDraftPersistence.ts#L76) · [Draft save](src/components/editor/editorDraftPersistence.ts#L137) · [Provider effect](src/components/editor/EditorDraftContext.tsx#L80) · [Split](src/components/editor/segmentsState.ts#L49)
- **Acceptance.** Keep failed saves visibly pending and preserve the last durable draft. Allow recovery after a transient storage failure. Align the editable clip limit with the persistent limit so accepted edits can be recovered after reload.

### BUG-015 — Playback controls show Pause after playback fails to start

**Priority** Medium. **Evidence** Reproduced with the production playback hook and a media element whose `play()` promise rejects.

- **Reproduction.** Start playback with the player button or keyboard when the browser rejects `play()`. The element remains paused while the editor sets `isPlaying` to `true`. The control presents Pause and the next activation follows the pause branch.
- **Cause.** Both toggle paths update React state immediately. Their rejection handlers only log the failure, and a failed start produces no `play` event to reconcile the state. [Keyboard toggle](src/components/editor/useEditorPlayback.ts#L75) · [Player toggle](src/components/editor/useEditorPlayback.ts#L149) · [Media event wiring](src/components/Editor.tsx#L216)
- **Acceptance.** A rejected start leaves the controls in the paused state and permits the next activation to retry. Successful playback and pause remain synchronized for keyboard and pointer input.

### BUG-016 — Converter chooses AAC that cannot encode a decodable source

**Priority** Medium. **Evidence** Reproduced in Chromium 148.0.7778.96 with a three-second H.264 MP4 containing mono AAC at 22,050 Hz. The native AAC encoder returned `NotSupportedError` for the sample rate. The converter displayed an audio decoding error and produced no download, although Mediabunny decoded the input and Chromium reported Opus support for the same source configuration. FFprobe confirmed H.264/AAC from the 48,000 Hz control in Chromium and VP8/Opus from the 22,050 Hz fixture in Firefox 150.0.2.

- **Cause.** The cached codec capability tests stereo at 48,000 Hz. The format decision uses those booleans, and the chosen encoder is later configured with the source's actual sample rate and channel count. The converter therefore selects MP4/AAC even when the source configuration only supports the Opus path. [Encoder probe](src/services/webcodecs/capability.ts#L115) · [Format decision call](src/services/webcodecs/webcodecExportService.ts#L114) · [Source-specific configuration](src/services/webcodecs/webcodecExportService.ts#L193)
- **Acceptance.** Convert the 22,050 Hz mono fixture using a supported audio configuration or a disclosed WebM/Opus fallback. Verify audible output and both tracks with FFprobe. Keep successful MP4/AAC for the 48,000 Hz control and report an encoding capability error when no sound-preserving output is available.

### BUG-017 — Ending screen sharing during setup can still start the recorder

**Priority** High. **Evidence** Reproduced with the production capture controller and controlled media streams and permission timing.

**Fix.** The session starts listening for screen-track termination before waiting for microphone or camera permission or composition. Setup returns to idle when sharing ends and releases late results through the original session. An active recorder still uses the normal stop path, including delivery of a stop event already queued by the browser. [Capture preparation](src/components/recorder/capturePreparation.ts) · [Capture controller](src/components/recorder/useRecorderController.ts)

**Verification.** Chromium and Firefox used synthetic device streams with native MediaRecorder. Ending sharing during microphone permission returned to setup without creating a recording. A late microphone stream was stopped after a successful restart, and the queued native stop finalized the new recording. Node tests cover the same ownership races and a track that ends at the setup handoff. [Capture preparation tests](tests/capture-preparation.test.mjs)

- **Reproduction.** Enable the microphone and select a screen. End sharing while the microphone permission is pending, then resolve the microphone request. The controller attempts `MediaRecorder.start()` with the screen video track already `ended`. The test recorder observed one start and no stop request.
- **Cause.** The screen track's `onended` handler is installed after microphone and camera permission waits and composition setup. The code proceeds without checking whether the event already happened. [Screen capture and permission waits](src/components/recorder/useRecorderController.ts#L87) · [Late handler](src/components/recorder/useRecorderController.ts#L116)
- **Acceptance.** If sharing ends at any point during setup, return to idle with clear feedback. Release acquired and late-arriving streams, and avoid starting `MediaRecorder`. Ending sharing after recording starts should continue to finalize exactly once.

### BUG-018 — A blocked IndexedDB open strands the app on the loading screen

**Priority** Low. **Evidence** Reproduced with an IndexedDB request double that emits `blocked` and remains pending. The loading-screen consequence is source-confirmed. Native reproduction remains open. The current schema requests version 1.

- **Reproduction.** Start with a database open request that is blocked by a connection or queued database operation on the same origin. The restore promise stays pending while the request remains blocked. The app's startup gate then prevents access to the recorder, converter and transcription surfaces.
- **Cause.** `VideoStorageService.init()` handles success, error and upgrade, and has neither a blocked handler nor a deadline. The loading flag clears only after the restore promise settles. [Database initialization](src/services/videoStorageService.ts#L20) · [Restore effect](src/components/useVideoSession.ts#L30) · [Startup gate](src/App.tsx#L117)
- **Acceptance.** Give users a recoverable storage message and a way to use other surfaces during an extended block. Allow retry after the blocking operation releases and handle late success without overwriting the active session.

### BUG-019 — Another transcription dialog can clear the model cache during an active job

**Priority** Medium. **Evidence** Reproduced in Chromium 148.0.7778.96 with two production-app tabs on the same origin, native CacheStorage and a controlled transcription Worker. The idle dialog removed a seeded model-cache entry while the other job remained active. Actual model initialization and the resulting offline failure were outside this reproduction.

- **Reproduction.** Open the MP3 transcription dialog in two tabs. Start a job in the first tab and keep it in audio preparation. In the idle tab, confirm **Clear downloaded model**. The shared cache is deleted while the first job is still active. A job that has yet to open the cache can lose access to previously downloaded assets and need to fetch them again.
- **Cause.** The dialog and provider use only their own activity state when allowing cache deletion. All sessions share the same origin-level speech-model cache. [Dialog guard](src/components/editor/transcript/TranscriptDialog.tsx#L51) · [Provider guard](src/components/editor/useTranscription.tsx#L124) · [Cache deletion](src/services/stt/modelStorage.ts#L111) · [Worker model preparation](src/services/stt/modelCache.ts#L141)
- **Acceptance.** Clearing waits for active model use or is explicitly unavailable during it. Verify two dialogs and two tabs, including a job preparing offline and successful clearing after both jobs finish.

Baseline checks passed on `630729c`: TypeScript, all 147 Node tests and the production build.

## Original findings

### BUG-001 — The Delete shortcut restores the full recording when one clip remains

**Priority: High. Evidence: Reproduced through the shortcut and reducer.** On a 20-second recording, use the timeline handles to retain only 8–12 seconds. With focus outside a form field, press **Delete** or **Backspace**. The timeline toolbar disables deletion of the last clip, yet the shortcut dispatches the action. The reducer restores 0–20 seconds and adds an undo entry. **Export Trimmed** can then include previously excluded footage.

Apply the same last-clip rule to shortcut and toolbar commands, with an authoritative guard in the reducer. Cover the one-clip action, valid multi-clip deletion, playhead repositioning, and undo. The earlier **Delete selection** reproduction exercised an unmounted legacy panel's reducer path. The keyboard reproduction exercises the active editor path.

[Toolbar guard](src/components/Editor.tsx) · [Shortcut dispatch](src/components/editor/useKeyboardShortcuts.ts) · [Reducer fallback](src/components/editor/segmentsState.ts) · [Trimmed export input](src/components/editor/useEditorExportController.ts)

### BUG-002 — MediaRecorder failure is reported as successful capture

**Priority: High. Evidence: Reproduced with simulated recorder events.** A recorder emitted an error, nonempty partial data, and a stop event. The controller invoked the regular completion callback with the partial Blob. A recording interrupted by an encoder error can reach the editor with no indication that content was lost.

Capture the recorder error in the session and distinguish an interrupted recording from a normal stop. Exercise normal stop, error before any data, error after chunks, and late events after release.

[Recorder callbacks](src/components/recorder/useRecorderController.ts) · [Completion dispatch](src/components/recorder/useRecorderController.ts) · [W3C event order](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-start)

### BUG-003 — The playhead drag scale is wrong after zooming in

**Priority: Medium. Evidence: Reproduced with simulated pointer events.** At 200% zoom, an 80-pixel drag from 10 seconds on a 60-second timeline with an 800-pixel viewport moved the playhead to 16 seconds. The 1,600-pixel track should map the drag to 13 seconds.

Measure the rendered track when the drag begins and use that width for the gesture. Cover zoom, horizontal scrolling, and a timeline with removed source ranges.

[Drag calculation](src/components/editor/DraggablePlayhead.tsx) · [Zoomed track](src/components/editor/ProTimeline.tsx) · [Playhead props](src/components/editor/ProTimeline.tsx)

### BUG-004 — Converter labels a WebM result as MP4

**Priority: Medium. Evidence: Source-confirmed.** The converter requests MP4. The shared encoder can return WebM when the MP4 codec combination is unavailable, and the result filename uses the actual format. The title, action, and success download copy still promise MP4. The download control can therefore say **Download MP4** over a `.webm` file.

Use the actual result format in download copy and disclose fallback where the user chooses to convert. Preserve compatible output and existing cancellation behavior. Verify with an MP4-capable configuration and a WebM-only configuration.

[Converter request and output](src/components/Converter.tsx) · [Download label](src/components/Converter.tsx) · [Encoder fallback](src/services/webcodecs/webcodecExportService.ts)

### BUG-005 — Denied preference storage can prevent the app from opening

**Priority: Medium. Evidence: Reproduced with injected storage denial.** When a browser denies access to local storage, the theme provider throws during initialization. It wraps the application root, so the recording and conversion surfaces cannot render. The language provider and theme writes also access the same optional storage without handling errors.

Read and write preferences on a best-effort basis. Preserve system theme, the default language, and in-memory changes when persistence is denied. Verify successful persistence and independent read/write failures.

[Application providers](src/index.tsx) · [Theme storage](src/context/ThemeContext.tsx) · [Language storage](src/i18n/index.tsx)

### BUG-006 — A stalled audio encoder can leave export processing indefinitely

**Priority: Medium. Evidence: Reproduced with an injected pending audio flush.** An audio-only export reached `AudioEncoder.flush()` and stayed pending until the user cancellation signal was sent. The audio flush has an abort handler and no automatic timeout. The corresponding video flush has a 30-second inactivity deadline. The actual frequency of stalled native encoders is unknown.

Add a bounded, abort-aware audio flush wait. Verify successful output, failure on a stalled flush, cancellation, and release of owned resources on both exits.

[Audio flush](src/services/webcodecs/webcodecExportService.ts) · [Abort-only helper](src/services/webcodecs/mediaWait.ts) · [Timed video flush](src/services/webcodecs/encodeVideoFrames.ts)

### BUG-007 — The timeline Hand tool has no drag-to-pan behavior

**Priority: Medium. Evidence: Source-confirmed.** Zoom until the track overflows, then select **Hand**. The timeline changes the pointer to a grab cursor. The track has no corresponding pan gesture, and a click in Hand mode seeks. The advertised **H** shortcut also has no binding in the editor.

Wire Hand mode to horizontal dragging and its advertised shortcut, with seek preserved in Select mode. Test an actual drag on a zoomed timeline, a Hand-mode click, and moving between tools by keyboard.

[Hand tool definition](src/components/editor/TimelineToolbar.tsx) · [Scrollable area](src/components/editor/ProTimeline.tsx) · [Click handling](src/components/editor/useTimelineInteraction.ts) · [Keyboard handler](src/components/editor/useKeyboardShortcuts.ts)

### BUG-008 — Export initialization cannot retry after an exceptional probe failure

**Priority: Medium. Evidence: Reproduced with one injected probe rejection.** The first capability probe threw. A second initialization call returned the cached promise without checking the now-successful probe. The app remained in **Engine Error** for the rest of the page session. A browser that genuinely lacks the required codecs should still report unavailable support.

Clear the in-flight initialization promise when the attempt settles and permit retry for exceptional probe failures. Also review the capability cache before retrying results represented as unsupported. Preserve concurrent-call deduplication and successful initialization caching.

[Initialization cache](src/services/exportService.ts) · [Failure state](src/services/exportService.ts) · [Capability cache](src/services/webcodecs/capability.ts)

### BUG-009 — Pause can throw after recording has stopped

**Priority: Low. Evidence: Chromium API behavior reproduced and app event path traced.** Stop changes the recorder to inactive before the UI removes the controls. The existing delayed finalization leaves Pause or Resume available briefly, and the callback only checks whether the recorder object exists. Calling `pause()` immediately after `stop()` produced `InvalidStateError` in Chromium. A rapid click in the full UI has not been reproduced.

Disable recording controls as soon as stop is requested and guard pause/resume against the actual recorder state. Keep the final chunk and resource cleanup behavior intact.

[Stop request](src/components/recorder/useRecorderController.ts) · [Delayed finalization](src/components/recorder/useRecorderController.ts) · [Pause and resume](src/components/recorder/useRecorderController.ts) · [Preview controls](src/components/recorder/RecorderPreview.tsx)

### BUG-010 — Camera compositing continues after a source fails to play

**Priority: Medium. Evidence: Source-confirmed.** With Camera PIP enabled, a rejection from the screen or camera video element's `play()` is logged and swallowed. The compositor then starts the canvas stream, so the recorder can appear to start while a source is unavailable. The rendered impact on real devices has not been reproduced.

Surface required source playback failure through the existing capture startup error path. Test the screen and camera rejection paths, successful composition, and release of media tracks, canvas, and audio resources.

[Source playback](src/utils/StreamCompositor.ts) · [Canvas stream startup](src/utils/StreamCompositor.ts) · [Capture startup cleanup](src/components/recorder/recorderControllerUtils.ts)

## Follow-up verification

- Reverse shuttle now clamps to the selected clip like the arrow keys. [Keyboard seek branches](src/components/editor/useKeyboardShortcuts.ts)
- The audio startup path resumes suspended contexts or fails visibly. A synthetic 440 Hz source was verified in Chromium. Behavior with a physical microphone, camera, and OS permission picker remains unverified. [Direct audio mix](src/components/recorder/recorderControllerUtils.ts) · [Bounded resume](src/utils/audioContext.ts)

## Refactoring candidates

The fixes apply REF-001, REF-002, REF-003, REF-005 and the shared editor-command portion of REF-004. The active editor uses `ProTimeline` and `InspectorPanel`. The inactive panels remain available for a separate removal decision.

| ID | Scope | Smallest useful change | Regression coverage |
| --- | --- | --- | --- |
| REF-001 | Editor timeline | Use one sequence coordinate model for ruler clicks, skimming, and playhead dragging. Keep source-time mapping and clip-edge behavior explicit. [Timeline mapping](src/components/editor/useTimelineInteraction.ts) · [Drag calculation](src/components/editor/DraggablePlayhead.tsx) | The same track position resolves consistently across controls at different zoom and scroll positions, including cuts with source gaps. |
| REF-002 | Capture lifecycle | Give the recording session one stopping state and one terminal outcome for a completed, interrupted, or cancelled capture. Keep raw streams, composed streams and late permission cleanup under the existing session owner. [Session owner](src/components/recorder/RecordingSession.ts) · [Finalization](src/components/recorder/useRecorderController.ts) | Normal stop, immediate pause and error races each produce one outcome and release resources once. |
| REF-003 | Export result presentation | Follow the active Inspector's use of the resolved export format in the Converter. Use the processed result for file extensions and completed download labels. [Output metadata](src/components/useExportOperation.ts) · [Inspector result](src/components/editor/InspectorPanel.tsx) · [Converter download](src/components/Converter.tsx) | Download text and filename agree for MP4, WebM fallback, and audio-only output. |
| REF-004 | Editor commands and inactive views | Route keyboard and toolbar deletion through the same command and shared last-clip rule. Inventory references to the inactive `EditorTrimPanel` and `EditorExportPanel` before a separate cleanup. [Toolbar callback](src/components/Editor.tsx) · [Shortcut callback](src/components/editor/useEditorPlayback.ts) · [Active Inspector](src/components/Editor.tsx) | Keyboard and toolbar delete the same clip, select the same survivor, seek consistently, and undo once. Confirm the active UI and any barrel exports before removing old files. |
| REF-005 | Export wait supervision | Extract the timed promise wait from the video encoder path when applying the audio flush fix. Reuse it where audio and video need the same cancellation and inactivity policy. [Video wait](src/services/webcodecs/encodeVideoFrames.ts) · [Audio flush](src/services/webcodecs/webcodecExportService.ts) | Complete, reject, time out, and cancel with the existing error and ownership contracts. |
