# Export Pipeline

The export pipeline takes the `MediaRecorder` WebM blob produced by the recorder and re-encodes it to an MP4 (H.264 + AAC) or WebM (VP8 + Opus) container with optional trim segments, target resolution, and target FPS applied.

This document explains the streaming architecture in [`src/services/webcodecs/webcodecExportService.ts`](../src/services/webcodecs/webcodecExportService.ts) and the browser quirks it works around.

---

## Streaming Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          exportWithWebCodecs                       │
│                                                                    │
│  ┌────────────┐    ┌────────────────────────┐    ┌──────────────┐  │
│  │ openSource │ →  │  rVFC playback loop    │ →  │  VideoEncoder│  │
│  │   Video    │    │  (drainDeadlinesUpTo)  │    │  (WebCodecs) │  │
│  └────────────┘    │                        │    └──────┬───────┘  │
│        │            └────────────┬────────────┘            │       │
│        │                         │                         ▼       │
│        │          ┌──────────────▼──────────┐    ┌──────────────┐  │
│        │          │  prev+current ImageBitmap│   │   muxer      │  │
│        │          │  (2-frame rolling buffer)│   │ (mp4 or webm)│  │
│        │          └──────────────────────────┘   └──────┬───────┘  │
│        │                                                 │         │
│        │          ┌──────────────────────────┐           │         │
│        └────────► │   decodeAudioFromBlob    │           │         │
│                   │   → AudioEncoder         │ ─────────►│         │
│                   └──────────────────────────┘           │         │
│                                                          ▼         │
│                                              MP4/WebM Blob (output)│
└────────────────────────────────────────────────────────────────────┘
```

## Key Properties

| Property | Value |
| --- | --- |
| Memory peak | ~50 MB (2 `ImageBitmap`s + encoder/muxer buffers) regardless of clip length |
| Decode strategy | Linear playback at `playbackRate = 16` driven by `requestVideoFrameCallback` |
| Encode strategy | One `VideoFrame` per output deadline, encoded inline and immediately closed |
| Mux strategy | Frames flow through `addVideoChunk` as they finish encoding |
| Fallback | Browsers without `requestVideoFrameCallback` use seek-based decode at target FPS |

A 38-second clip exports in **~3 seconds on Chrome**, versus ~40 minutes under the previous seek-per-frame implementation.

---

## Phase Breakdown

### 1. `openSourceVideo(blob)`

Creates a hidden `<video>` element, sets `src` from the input blob, waits for `loadedmetadata`. Then applies the **Chrome WebM duration=Infinity workaround**:

```ts
if (!Number.isFinite(video.duration)) {
    // Force Chrome to scan the file and rewrite duration metadata
    await new Promise<void>((resolve) => {
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.currentTime = 0;
            resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = 1e101;
    });
}
```

### 2. `planDeadlines(segments, targetFps, frameDurationUs)`

Pre-computes the **full list of output frame deadlines**, each with:

- `inputTime` — the source timestamp this output frame samples from (seconds)
- `outputTimestampUs` — the position in the output stream (microseconds), gap-free across segments
- `isKeyframe` — every `targetFps * 2` frames (i.e., 2-second GOP)

For multi-segment exports, deadlines are stitched back-to-back so the output never has gaps.

### 3. `decodeAudioFromBlob(blob)`

Loads the full audio track into an `AudioBuffer` via `OfflineAudioContext.decodeAudioData`. Audio is small relative to video and decoded once. Failures are silently swallowed (no-audio export still succeeds).

> **Known limitation:** Chrome's `decodeAudioData` can fail on some WebM containers. The output will then be muxed without audio.

### 4. Muxer + Encoder setup

Codec selection comes from [`capability.ts`](../src/services/webcodecs/capability.ts):

| Browser | Video | Audio | Container |
| --- | --- | --- | --- |
| Chrome / Edge / Safari | H.264 (`avc1.*`) | AAC | MP4 |
| Firefox | VP8 (`vp8`) | Opus | WebM |

Bitrate scales with output resolution: `videoBitsPerSecond * pixelRatio` clamped to `[0.5, 3]` of the preset's base bitrate.

### 5. Streaming decode → encode loop

```ts
video.playbackRate = 16;

const onFrame = (_now, metadata) => {
    if (nextDeadline >= totalDeadlines) return finish();

    ctx.drawImage(video, 0, 0, width, height);  // resize to target
    const bitmap = canvas.transferToImageBitmap();

    drainDeadlinesUpTo(bitmap, metadata.mediaTime);

    if (prevBitmap) prevBitmap.close();
    prevBitmap = bitmap;
    prevInputTime = metadata.mediaTime;

    if (video.ended) finish();
    else video.requestVideoFrameCallback(onFrame);
};
video.requestVideoFrameCallback(onFrame);
video.play();
```

`drainDeadlinesUpTo(current, inputTime)` walks pending deadlines whose `inputTime ≤ current input time` and, for each one, picks **whichever of `prev` or `current` is closer in input time** (nearest-neighbour resampling). The picked bitmap is wrapped in a `VideoFrame` with the deadline's output timestamp and handed to the encoder, then immediately closed.

After the playback ends, any remaining deadlines (e.g., when output FPS is higher than input FPS) are flushed using the **last decoded bitmap** as a freeze-frame fallback.

### 6. Audio encode pass

After video is done, audio is encoded segment-by-segment in one pass:

```ts
for (const segment of segments) {
    const f32 = extractPlanarSamples(audioBuffer, segment);
    const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate, numberOfChannels, numberOfFrames, timestamp: audioOutputUs,
        data: f32,
    });
    audioEncoder.encode(audioData);
    audioData.close();
    audioOutputUs += (length / sampleRate) * 1_000_000;
}
```

### 7. Finalize

`videoEncoder.flush() → audioEncoder.flush() → muxer.finalize()` → return a `Blob` of the muxer's `ArrayBuffer`.

---

## Browser Quirks Encoded Here

### Chrome WebM `duration = Infinity` quirk

`MediaRecorder` in Chrome writes streaming-friendly WebM with the duration field set to `0xFFFFFFFFFFFFFFFF` (treated as `Infinity` by browsers). `video.duration` returns `Infinity` until you seek past the end, which forces Chrome to scan the file and rewrite metadata. Without the workaround, any code that computes `totalFrames = duration * fps` produces `Infinity` and either loops forever or never enters the loop.

Firefox writes the correct duration on `MediaRecorder.stop()` so this workaround is a no-op there.

### Firefox H.264 `isConfigSupported` lies

`VideoEncoder.isConfigSupported({ codec: 'avc1.42001f' })` returns `{ supported: true }` on Firefox even though `encoder.configure()` then throws. [`capability.ts`](../src/services/webcodecs/capability.ts) performs a **real trial encode of a 64×64 black frame** before declaring support.

### Chrome seek-based decode is catastrophically slow on MediaRecorder WebM

`MediaRecorder`'s WebM has no cues table and sparse keyframes. Each `video.currentTime = t; await onseeked` on Chrome takes ~1-2 seconds because the decoder has to scan from the previous keyframe. 1140 seeks × 2 s = ~40 minutes. The rVFC fast path avoids seeks entirely.

---

## When to Touch This Code

- **Adding a new output format** — add a muxer + capability flags in `capability.ts`, wire codec selection in `exportWithWebCodecs`
- **Adding a new resolution preset** — extend `RESOLUTION_MAP`
- **Changing keyframe interval** — change the `i % (targetFps * 2)` formula in `planDeadlines`
- **CRF / quality slider rework** — `crf` is currently accepted in `ExportOptions` but **not used** by the WebCodecs pipeline (WebCodecs uses bitrate-mode encoding, not CRF). Either drop the UI control or map it to a bitrate scale.
- **Re-introducing FFmpeg** — **don't.** It re-triggers GPL/LGPL, which our LICENSE forbids. WebCodecs is enough.
