# Browser verification

The [production smoke script](../scripts/browser_smoke.py) tests the built app under the GitHub Pages-style project subpath on a local origin. It uses disposable browser profiles and generated video fixtures.

## Run locally

Use FFmpeg and FFprobe on PATH, and install Python Playwright with Chromium, Firefox and WebKit browser assets. Build the application before running the smoke suite.

```sh
npm ci
npm run build
python -B scripts/browser_smoke.py
```

Pass `--browser chromium`, `--browser firefox`, or `--browser webkit` to isolate a failure. The script reports one JSON result per browser. It compares the stated output format with the actual downloaded container and checks the video and audio tracks with FFprobe. Synthetic capture exercises permission denial, native MediaRecorder stop and pause/resume, track cleanup and session restore. Editor checks cover restored trims, rejection and explicit reset of a corrupt draft, and seeking into a later clip during preview. The local server then disconnects the origin to verify that a cached converter can reopen, while a fresh profile cannot make an initial offline visit.

## Verified production build

Results below are from the local Windows smoke suite for the production code at `dc49d1f`. Playwright used its bundled browsers. Capture uses a moving canvas stream and an injected permission response.

| Browser | Capture and editing | Download bytes and damaged input | Manifest and offline |
| --- | --- | --- | --- |
| Chromium 148.0.7778.96 | VP9 WebM, pause/resume, restore, corrupt-draft recovery and manual seek. A waiting PWA update was blocked during capture. Confirming it afterward restored the trim. | Silent video produced H.264 MP4. Opus and AAC inputs produced H.264/AAC MP4. Damaged WebM was rejected. | Manifest, all icon dimensions and cache-backed reload passed. |
| Firefox 150.0.2 | VP8 WebM, pause/resume, restore, corrupt-draft recovery and manual seek. | Silent video produced H.264 MP4. Opus and AAC inputs fell back to VP8/Opus WebM. Damaged WebM was rejected. | Manifest, all icon dimensions and cache-backed reload passed. |
| WebKit 26.4 on Windows | Required WebM recording and canvas stream APIs were unavailable in this build. | Conversion showed an error and produced no download. | Manifest, all icon dimensions and cache-backed reload passed. |

The Firefox fixture originally exposed a download that appeared successful in the UI but lacked a recognized audio stream. The corrected WebM output uses the Opus codec identifier specified by the muxer. FFprobe identified Opus in both audio-bearing download cases. [Muxer format documentation](https://github.com/Vanilagy/webm-muxer/blob/main/MIGRATION-GUIDE.md)

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
