# Browser verification

The [production smoke script](../scripts/browser_smoke.py) tests the built app under the GitHub Pages-style project subpath on a local origin. It uses disposable browser profiles and generated video fixtures.

## Run locally

Use FFmpeg and FFprobe on PATH, and install Python Playwright with Chromium, Firefox and WebKit browser assets. Build the application before running the smoke suite.

```sh
npm ci
npm run build
python -B scripts/browser_smoke.py
```

Pass `--browser chromium`, `--browser firefox`, or `--browser webkit` to isolate a failure. The script reports one JSON result per browser. It compares the stated output format with the actual downloaded container and checks the video and audio tracks with FFprobe. Conversion fixtures include a streamed WebM with uneven video frame times and Opus audio. Synthetic capture exercises permission denial, native MediaRecorder stop and pause/resume, track cleanup and session restore. Editor checks cover restored trims, rejection and explicit reset of a corrupt draft, and seeking into a later clip during preview. The local server then disconnects the origin to verify that a cached converter can reopen, while a fresh profile cannot make an initial offline visit.

Chromium and Firefox check MP3 conversion and direct export from a completed recording. The editor check records a synthetic audio track, shortens the timeline, cancels an MP3 export during encoder loading, and verifies the retried download against the whole recording's duration. FFprobe checks the file format and audio track. Both entry points report an error when the source has no audio track. Chromium also tests conversion across app navigation and the reload, cancel and discard confirmations. To verify build identities and update protection, build two output directories with distinct `VITE_BUILD_VERSION` values and run `python -B scripts/browser_smoke_update.py <current-dist> <next-dist> <current-id> <next-id>`.

## Verified production build

Results below are from the local Windows smoke suite for the production code at `dc49d1f`. Playwright used its bundled browsers. Capture uses a moving canvas stream and an injected permission response.

| Browser | Capture and editing | Download bytes and damaged input | Manifest and offline |
| --- | --- | --- | --- |
| Chromium 148.0.7778.96 | VP9 WebM, pause/resume, restore, corrupt-draft recovery and manual seek. A waiting PWA update was blocked during capture. Confirming it afterward restored the trim. | Silent video produced H.264 MP4. Opus and AAC inputs produced H.264/AAC MP4. Damaged WebM was rejected. | Manifest, all icon dimensions and cache-backed reload passed. |
| Firefox 150.0.2 | VP8 WebM, pause/resume, restore, corrupt-draft recovery and manual seek. | Silent video produced H.264 MP4. Opus and AAC inputs fell back to VP8/Opus WebM. Damaged WebM was rejected. | Manifest, all icon dimensions and cache-backed reload passed. |
| WebKit 26.4 on Windows | Required WebM recording and canvas stream APIs were unavailable in this build. | Conversion showed an error and produced no download. | Manifest, all icon dimensions and cache-backed reload passed. |

The Firefox fixture originally exposed a download that appeared successful in the UI but lacked a recognized audio stream. The corrected WebM output uses the Opus codec identifier specified by the muxer. FFprobe identified Opus in both audio-bearing download cases. [Muxer format documentation](https://github.com/Vanilagy/webm-muxer/blob/main/MIGRATION-GUIDE.md)

## Export timing and memory sample

Local Windows comparison of `293b8ee` and `dc49d1f`, one run per configuration. Both used the same silent moving VP8 input and the default 30 fps converter output. FFprobe confirmed the dimensions, container, duration within 100 ms, and exact output frame count. Memory is the increase from the pre-conversion reading to the highest sum of browser process working sets sampled every 40 ms. It includes shared pages, so interpret it as a coarse process-level measure.

| Engine and source | Frames | Time, baseline → current | Working set increase, baseline → current |
| --- | --- | --- | --- |
| Chromium, 30 s at 360p/24 fps | 900 | 2.45 s → 2.41 s | 541.9 MiB → 538.2 MiB |
| Chromium, 60 s at 720p/30 fps | 1,800 | 12.24 s → 12.25 s | 563.1 MiB → 587.0 MiB |
| Firefox, 30 s at 360p/24 fps | 900 | 3.82 s → 3.90 s | 224.4 MiB → 214.1 MiB |
| Firefox, 60 s at 720p/30 fps | 1,800 | 16.21 s → 15.76 s | 292.0 MiB → 267.3 MiB |

On the 60-second fixture, the retry action reappeared within 132 ms in Chromium and 241 ms in Firefox after clicking Cancel on the current release. Neither browser published a download during the 300 ms observation window after cancellation. Longer exports, audio-bearing stress fixtures and file-backed output need separate evaluation.

## Offline caption verification

Run `python -B scripts/browser_smoke_transcription.py --browser chromium --long` after the production build. Use `--browser firefox --timeout-seconds 600` for the short Firefox replay. The public fixture combines an English JFK excerpt and a Mandarin sample with pauses. The long replay repeats this pair for 316 seconds. The check warms the model, closes the browser, disables networking and the preview server, then opens the same profile and generates captions again.

Chromium 148 produced 52 cues from the 316-second offline replay in 362 seconds. The measured peak was 1,207 MiB in the largest browser process. Approximate English word error was 11.8% and Mandarin character error was 23.1% for this repeated fixture. These values describe one local run and one pair of reference utterances.

Firefox 150 produced four cues from the 18.6-second offline replay in 184 seconds while the Chromium run was active. The 316-second replay was measured only in Chromium. Safari and mobile browser execution remain unverified.

The smoke covers no-audio and silence handling before downloads, cancel, navigation during an active job, editing, cue seeking, SRT and TXT downloads, and clearing the model while retaining the application cache.

## Physical device checks

Record the browser version, operating system, capture source and output bytes for each manual result. Use test content and disposable recordings.

| Flow | Evidence to collect |
| --- | --- |
| System screen picker | Grant and deny a screen, window and tab source. Record which sources offer system audio. Compare the actual recorded tracks with the selected devices. |
| Microphone and camera | Capture speech with microphone only and camera picture-in-picture. Check visible motion, audible sound, and device indicators after stopping. |
| Background picture-in-picture | Use a moving fixture in a second tab. Bring that tab forward for at least 30 seconds and confirm that the recording tab reports `document.hidden`. Compare direct capture and picture-in-picture frame timestamps and motion. |
| Install and update | Install through the browser menu, launch from the system icon, and reopen offline after a successful cache fill. Confirm that active capture or export blocks an app-controlled reload. |
| Output format compatibility | Try a silent video, an Opus input, an AAC input and an intentionally damaged file. Inspect the downloaded tracks, MIME/container, label, and any fallback or error on each tested OS. |

Bundled WebKit is an engine check on the test host. Safari on Apple hardware requires a separate run. Likewise, a locally served subpath validates relative URLs and cached navigation. Installation from the hosted origin and launch from the operating system require a separate check.
