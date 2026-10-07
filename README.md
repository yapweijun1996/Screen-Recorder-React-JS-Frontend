# ScreenClip Pro

Professional browser-based screen recorder and video editor. 100% client-side — your video never leaves your machine.

> **License:** MIT — free for personal and commercial use, including modification and redistribution. See [LICENSE](LICENSE).

---

## ✨ Features

- 🎥 **Screen + Webcam + Microphone capture** — picture-in-picture compositing built in
- ✂️ **Multi-segment trim editor** — keep/remove regions; edits and undo survive navigation to the converter within the same tab
- 🚀 **WebCodecs streaming export** — bounded decoded frames and audio blocks; compressed output remains in memory
- 📦 **MP4 (H.264 + AAC) on Chrome/Edge/Safari, WebM (VP8 + Opus) on Firefox** — auto-detected per browser
- 🌐 **PWA** — installable, offline-capable, service-worker update prompts with safe, confirmed reloads
- 🎨 **Dark / light theme** with prefers-color-scheme support
- 🌍 **10 languages** out of the box (en, zh, ja, ko, es, fr, de, pt, hi, id)
- 🔒 **Zero server uploads** — all processing in-browser
- 💾 **Recording recovery** — original recordings persist after transaction commit; save failures show a backup download link. Edit drafts persist during page navigation, not reloads.

## 🚀 Quick Start

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # Production build → dist/
npm run preview   # Serve dist/ locally
```

Requires Node 20+ and a modern browser (Chrome 87+, Firefox 130+, Safari 15.4+, Edge 87+).

## 🏗️ Tech Stack

| Layer | Tech |
| --- | --- |
| Framework | React 19 + TypeScript 5 |
| Build | Vite 6, `vite-plugin-pwa`, Tailwind 3 |
| Capture | `getDisplayMedia`, `getUserMedia`, `MediaRecorder` |
| Encode | WebCodecs (`VideoEncoder` / `AudioEncoder`) |
| Mux | `mp4-muxer` (MIT) / `webm-muxer` (MIT) |
| State | React Context (`ThemeContext`, `I18nProvider`) |
| Icons | `lucide-react` |

Runtime dependencies use MIT/ISC and MPL-2.0 licenses. Mediabunny is bundled unmodified with its license and upstream source link. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 📐 Architecture (TL;DR)

```
src/
├── App.tsx                       # Top-level route: Recorder ↔ Editor
├── index.tsx                     # React mount + Service Worker registration
├── registerSW.ts                 # PWA update prompt and idle-only reload
├── components/
│   ├── Recorder.tsx              # Recording mode root
│   ├── recorder/                 # PIP compositing, mic mixing, controls
│   ├── Editor.tsx                # Editor mode root
│   └── editor/                   # Timeline, segments, export panel
├── services/
│   ├── exportService.ts          # Public API; routes to WebCodecs pipeline
│   ├── videoStorageService.ts    # IndexedDB for in-progress recordings
│   └── webcodecs/
│       ├── capability.ts         # Trial-encode based H.264/VP8 + AAC/Opus detection
│       └── webcodecExportService.ts  # Streaming decode → encode → mux pipeline
├── utils/
│   ├── StreamCompositor.ts       # Canvas-based screen + cam + mic mixer
│   └── AudioVisualizer.ts        # Mic level meter
├── context/ThemeContext.tsx      # Light/dark theme provider
└── i18n/                         # Translation tables + provider
```

Detailed docs:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component graph, data flow, services
- [docs/EXPORT_PIPELINE.md](docs/EXPORT_PIPELINE.md) — how WebCodecs streaming export works, the Chrome WebM duration quirk, and lazy packet-based frame sampling
- [docs/PWA.md](docs/PWA.md) — service worker update confirmation flow, manifest, safe-area handling, what's still pending for full 2026 compliance

## 🔄 Project Status

Open-source portfolio project under active development. Recent hardening pass:

- ✅ Removed GPL-encumbered `ffmpeg.wasm` binaries (replaced with WebCodecs + MIT muxers)
- ✅ Released under MIT — anyone can use, fork, modify, and ship
- ✅ Streaming WebCodecs export — ~500× faster on Chrome (38s clip: 40 min → 3 s)
- ✅ Cancellable export with AbortSignal — users can stop a long export mid-flight
- ✅ PWA updates prompt for confirmation and protect active recording/export
- ✅ `viewport-fit=cover` + safe-area CSS for notched devices
- ✅ Dropped legacy v1 dead code (~1200 LoC)

See [task.md](task.md) for the running task log and [REVIEW_AND_PLAN.md](REVIEW_AND_PLAN.md) for editor UI/UX roadmap.

## 📜 License

**MIT** — free for personal, educational, and commercial use. You may use, copy, modify, merge, publish, distribute, sublicense, or sell copies of the software, as long as the original copyright notice and the MIT license text are preserved.

See [LICENSE](LICENSE) for the full text and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the attribution of bundled open-source components (MIT / ISC / Apache-2.0 / MPL-2.0).

Contributions, issues, and stars welcome on [GitHub](https://github.com/yapweijun1996/Screen-Recorder-React-JS-Frontend).

### Verification

Run `npm ci`, then `npm test`, `npm run typecheck`, and `npm run build`. Regression tests cover recording resource ownership, late permission responses, audio-track probing and decode failures, fractional multi-cut audio/video timelines, bounded media blocks and encoder queue backpressure, video frame fidelity, terminal encoder errors, aspect-preserving dimensions, PWA waiting/activation, draft history, cancellable media waits, late export results and storage commit/abort handling. Device APIs are simulated in automated tests.

Export quality uses bitrate presets. Video and audio are read lazily through Mediabunny for requested timestamps/ranges. Resolution presets preserve source orientation and aspect ratio. Video encoder errors stop export; no restart may silently discard frames. Audio decode failures stop export with a visible message unless MP4/WebM metadata confirms the source has no audio track.
