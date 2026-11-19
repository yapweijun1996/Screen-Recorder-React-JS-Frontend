# Export Pipeline

The export pipeline takes the `MediaRecorder` WebM blob produced by the recorder and re-encodes it to an MP4 (H.264 + AAC) or WebM (VP8 + Opus) container with optional trim segments, target resolution, and target FPS applied.

This document explains the streaming architecture in [`src/services/webcodecs/webcodecExportService.ts`](../src/services/webcodecs/webcodecExportService.ts) and the browser quirks it works around.

---

## Streaming Architecture

```text
Blob -> openSourceVideo (duration metadata only)
     -> openVideoSource -> VideoSampleSink (requested source timestamps)
                        -> aspect-preserving canvas -> VideoEncoder -> muxer
     -> openAudioSource -> AudioSampleSink (selected ranges)
                        -> bounded PCM blocks -> AudioEncoder -> muxer
muxer.finalize() -> MP4/WebM Blob
```

## Key Properties

| Property | Value |
| --- | --- |
| Decoded data | Bounded decoder prefetch; one current video sample/canvas, ≤4 pending video encoder inputs; ≤4096-frame PCM copies and ≤4 pending audio encoder inputs |
| Growing memory | Compressed muxer output and container metadata grow with duration. Frame deadlines are generated on demand. |
| Decode strategy | Lazy Mediabunny video samples at requested source timestamps |
| Encode strategy | One `VideoFrame` per output deadline, encoded inline and immediately closed |
| Mux strategy | Frames flow through `addVideoChunk` as they finish encoding |
| Fallback | A compatible alternate container preserves the source tracks. Unreadable inputs and unavailable codecs produce distinct errors. |

Export speed depends on actual source decoding, resizing and encoding. It does not depend on how quickly a hidden video can skip through displayed frames.

---

## Phase Breakdown

### 1. `openSourceVideo(blob)`

Creates a hidden `<video>` element, sets `src` from the input blob, waits for `loadedmetadata`. Then applies the **Chrome WebM duration=Infinity workaround**:

```ts
if (!Number.isFinite(video.duration)) {
    await seekVideo(video, 1e101, signal);
    await seekVideo(video, 0, signal);
}
```

### 2. Shared timeline and `createDeadlinePlan(timeline, targetFps)`

Computes the total frame count and iterates output frame deadlines as needed. Each deadline carries:

- `inputTime` — the source timestamp this output frame samples from (seconds)
- `outputTimestampUs` — the position in the output stream (microseconds), gap-free across segments
- `durationUs` — each frame interval; the final frame of a cut stops exactly at its cumulative output boundary
- `isKeyframe` — every `targetFps * 2` frames (i.e., 2-second GOP)

`exportTimeline.ts` clamps selections to source duration and rounds cumulative boundaries once. Audio sample positions and video timestamps derive from this same timeline. Each cut may end with a shorter video frame; no independent whole-frame rounding is added per cut. Audio boundaries are rounded from cumulative positions at the source sample rate, with error bounded to half a sample.

### 3. `openAudioSource(blob)`

[`exportAudio.ts`](../src/services/webcodecs/exportAudio.ts) uses Mediabunny `Input` and `BlobSource` with an 8 MiB read cache. It inspects audio metadata and decoder support before mux setup, then `AudioSampleSink` decodes selected ranges on demand. The library is evaluated on the first export as a separate lazy chunk; PWA precaching can download that chunk in the background. No whole-file `arrayBuffer()` or whole-track PCM allocation is used.

If decoding fails, [`audioTrackProbe.ts`](../src/services/webcodecs/audioTrackProbe.ts) checks MP4 handler boxes or WebM track metadata without reading media payloads. Confirmed video-only files can still export without sound. Files with audio, malformed metadata, or unrecognized containers fail with `AudioExportError('decodeFailed')`; the editor and converter show a translated message instead of silently removing sound. Audio-only export of a confirmed silent file fails with `AudioExportError('noTrack')`.

Metadata inspection is bounded to 4096 header reads. An inconclusive result never authorizes silent export. Unknown or unsupported codecs remain visible failures. Actual support depends on the browser AudioDecoder and Mediabunny format support.

### 4. Muxer + Encoder setup

[`formatDecision.ts`](../src/services/webcodecs/formatDecision.ts) combines the requested format, decoded source tracks and runtime encoder probes from [`capability.ts`](../src/services/webcodecs/capability.ts).

| Container | Video codec | Audio codec when required |
| --- | --- | --- |
| MP4 | H.264 (`avc1.*`) | AAC |
| WebM | VP8 (`vp8`) | Opus, signaled as `A_OPUS` in the muxer |

Bitrate scales with output resolution: `videoBitsPerSecond * pixelRatio` clamped to `[0.5, 3]` of the preset's base bitrate.

### 5. Streaming decode → encode loop

[`exportVideo.ts`](../src/services/webcodecs/exportVideo.ts) opens a Mediabunny `Input` with an 8 MiB read cache and checks video decoder support. WebM without declared duration uses presentation-order decoding with one-frame lookahead to avoid unreliable timestamp seeks. Other sources use `VideoSampleSink.samplesAtTimestamps()`. Both paths consume deadlines lazily. Browser playback speed and display refresh do not determine the exported frames.

Sampling uses the source frame covering each requested timestamp. A one-microsecond tolerance accounts for WebCodecs timestamp rounding at frame boundaries. A short initial video gap holds the first available frame. The sequential path holds the preceding decoded picture between frames and during an audio tail. Missing required samples or decoder failures stop export. Rotation and pixel aspect ratio come from the video track's display dimensions.

[`exportHelpers.ts`](../src/services/webcodecs/exportHelpers.ts) fits each resolution preset to the source orientation and aspect ratio, then rounds dimensions to even pixels for H.264. At 720p, 16:9 exports as 1280×720, 9:16 as 720×1280, and 4:3 as 960×720. `drawWithFit({ fit: 'contain' })` preserves the exact source ratio if even rounding introduces a small border.

[`encodeVideoFrames.ts`](../src/services/webcodecs/encodeVideoFrames.ts) draws one decoded sample into the output canvas, timestamps the `VideoFrame` from the shared cut timeline, and closes both after submission. It waits when `encodeQueueSize` reaches four, and yields a macrotask every 16 frames for responsive cancellation. The video encoder is flushed before the audio pass.

Every encoder error, including `QuotaExceededError`, rejects the export and interrupts decoder, queue and flush waits. The encoder is never restarted after discarding frames. Output timestamps must match distinct submitted deadlines, and flush must produce every requested frame. Errors raised by the muxer output callback also reach the caller.

MP4 chunk durations are supplied from the shared timeline rather than trusting platform encoder duration metadata. The muxer's integer timescale can introduce sub-frame rounding. Its sample table can infer the final packet duration from the previous timestamp interval; container/player duration remains derived from the supplied cut endpoint. WebM muxing does not encode per-frame duration, so its final packet endpoint can differ by one frame. These are container limits, distinct from dropped source frames or cumulative per-cut drift.

### 6. Audio encode pass

After video is done, `encodeAudioTimeline.ts` consumes one decoded audio sample at a time, copies at most 4096 frames per channel into planar `AudioData`, and waits when four encoder inputs are pending. Each sample and AudioData is closed after use. A macrotask every 16 blocks keeps cancellation responsive even when decoding is fast.

Source timestamps determine the position inside each selected cut. Leading gaps and a shorter audio track are padded with silence, preserving later cut boundaries. Audio output timestamps use cumulative sample counts rather than accumulating rounded per-block durations. AAC/Opus encoders can add fixed codec priming/padding; this is distinct from cumulative cut drift. On the tested Chrome/macOS AAC encoder, one cut and twenty cuts of the same 10.020-second total both produced a 10.090667-second audio track.

### 7. Finalize

`videoEncoder.flush() → audioEncoder.flush() → muxer.finalize()` → return a `Blob` of the muxer's `ArrayBuffer`.

When the source includes sound, the encoder must emit audio chunks and the finalized container must report an audio track before the job produces a downloadable result. The browser smoke suite inspects downloaded bytes and checks the track codecs with FFprobe.

---

## Browser Quirks Encoded Here

### Chrome WebM `duration = Infinity` quirk

`MediaRecorder` in Chrome writes streaming-friendly WebM with the duration field set to `0xFFFFFFFFFFFFFFFF` (treated as `Infinity` by browsers). `video.duration` returns `Infinity` until you seek past the end, which forces Chrome to scan the file and rewrite metadata. Without the workaround, any code that computes `totalFrames = duration * fps` produces `Infinity` and either loops forever or never enters the loop.

Firefox writes the correct duration on `MediaRecorder.stop()` so this workaround is a no-op there.

### Firefox H.264 `isConfigSupported` lies

`VideoEncoder.isConfigSupported({ codec: 'avc1.42001f' })` returns `{ supported: true }` on Firefox even though `encoder.configure()` then throws. [`capability.ts`](../src/services/webcodecs/capability.ts) performs a **real trial encode of a 64×64 black frame** before declaring support.

### MediaRecorder WebM without cues

MediaRecorder WebM can lack a cues table and have sparse keyframes. A streaming recording produced no usable samples for many timestamp seeks despite decoding in presentation order. The sequential path avoids that lookup failure and retains the original audio timeline. Metadata duration probing retains the existing Chrome workaround above.

---

## Cancellation

`exportWithWebCodecs()` accepts an optional `AbortSignal`. The shared UI hooks create a task through `ExportTaskScope`. Actual disposal cancels the task. The converter stays mounted across in-app surfaces, and confirming its Cancel action stops conversion. A replacement task invalidates old progress/results, and each job receives its own progress callback.

`mediaWait.ts` attaches listeners before setting `src` or seeking, checks already-ready media, and handles abort, load errors and a 30-second timeout. Seeking to the current position completes without waiting for an event that may never fire. Source setup releases its video element and object URL even when it fails before the coordinator starts.

Video sample, queue and flush waits handle abort and a 30-second inactivity timeout. The video pass returns its iterator and closes its sample/frame/encoder on every exit, including late samples delivered after an abandoned wait. The coordinator disposes both media inputs and releases metadata video resources. Decoder support or container parsing failures remain visible export failures; there is no lossy display-playback fallback.

Audio read, queue and flush waits reject promptly on abort. Audio queue and flush waits also have a 30-second inactivity timeout. Disposing the Mediabunny input cancels reads, closes decoders and releases queued samples. The coordinator disposes it on success, failure and cancellation. Result object URLs are allocated only while the task is current, and are revoked on a new export, clear or unmount.

## MP3 conversion and result lifetime

MP3 is an audio-only option in the converter. [The MP3 service](../src/services/mp3ExportService.ts) decodes the primary audio track through Mediabunny and selects a bitrate from the chosen quality preset. It uses native support if available, otherwise it loads a worker-backed LAME extension on demand. The export returns `audio/mpeg` with an `.mp3` extension. The [third-party notice](../THIRD_PARTY_NOTICES.md#mediabunny-mp3-extension-and-lame) documents the encoder and corresponding source.

The converter protects active work and finished results before the first download is requested. Reload and close use the browser's own warning where supported. An app-controlled update waits until the conversion is cancelled or fails, or until the user requests a download or discards the result. Files and pending results stay in memory for the lifetime of the current browser document. A frozen or discarded browser tab can suspend or end the conversion. [Browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) · [Leave confirmation](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)

---

## When to Touch This Code

- **Adding a new output format** — add a muxer + capability flags in `capability.ts`, wire codec selection in `exportWithWebCodecs`
- **Adding a new resolution preset** — extend `RESOLUTION_MAP` and the `ExportResolution` union, and test orientation, aspect ratio and even dimensions
- **Changing keyframe interval** — update the keyframe cadence in `createDeadlinePlan`
- **Quality controls** — presets select video/audio bitrates. The unused CRF field and control have been removed from the UI and `ExportOptions`.
- **MP4 and WebM formats** — keep encoding on WebCodecs and the current muxers. The standalone MP3 encoder has a separate [license notice](../THIRD_PARTY_NOTICES.md#mediabunny-mp3-extension-and-lame).
