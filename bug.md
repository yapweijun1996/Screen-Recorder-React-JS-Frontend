# ScreenClip Pro Bug Register

Audit baseline `c378c1e9a702147ba81f9144a9227a1d504676d2`.

BUG-001 through BUG-010 are fixed in the source tree containing this register. The findings below describe the original behavior and the verification plan. **Reproduced** records an exercised baseline path. **Source-confirmed** records evidence from reading the baseline implementation.

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

## Findings

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
