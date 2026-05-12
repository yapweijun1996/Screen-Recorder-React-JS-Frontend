# ScreenClip Pro

Professional browser-based screen recorder and video editor. 100% client-side — your video never leaves your machine.

> **License:** Proprietary. See [LICENSE](LICENSE). For commercial licensing contact `yapweijun1996@gmail.com`.

---

## ✨ Features

- 🎥 **Screen + Webcam + Microphone capture** — picture-in-picture compositing built in
- ✂️ **Multi-segment trim editor** — keep/remove regions on a frame-accurate timeline
- 🚀 **WebCodecs streaming export** — encodes ~real-time-or-faster, constant memory regardless of clip length
- 📦 **MP4 (H.264 + AAC) on Chrome/Edge/Safari, WebM (VP8 + Opus) on Firefox** — auto-detected per browser
- 🌐 **PWA** — installable, offline-capable, auto-updating service worker with force-reload on new versions
- 🎨 **Dark / light theme** with prefers-color-scheme support
- 🌍 **10 languages** out of the box (en, zh, ja, ko, es, fr, de, pt, hi, id)
- 🔒 **Zero server uploads** — all processing in-browser

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

All runtime dependencies are MIT/ISC-licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 📐 Architecture (TL;DR)

```
src/
├── App.tsx                       # Top-level route: Recorder ↔ Editor
├── index.tsx                     # React mount + Service Worker registration
├── registerSW.ts                 # PWA auto-update with forced reload
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
- [docs/EXPORT_PIPELINE.md](docs/EXPORT_PIPELINE.md) — how WebCodecs streaming export works, the Chrome WebM duration quirk, and the 16x-playback `requestVideoFrameCallback` fast path
- [docs/PWA.md](docs/PWA.md) — service worker auto-update flow, manifest, safe-area handling, what's still pending for full 2026 compliance

## 🔄 Project Status

This project recently underwent a hardening pass for commercial readiness:

- ✅ Removed GPL-encumbered `ffmpeg.wasm` binaries (replaced with WebCodecs + MIT muxers)
- ✅ Proprietary LICENSE and third-party notices added
- ✅ Streaming WebCodecs export — ~500× faster on Chrome (38s clip: 40 min → 3 s)
- ✅ PWA auto-update with forced reload (no more stale tabs)
- ✅ `viewport-fit=cover` + safe-area CSS for notched devices
- ✅ Dropped legacy v1 dead code (~1200 LoC)

See [task.md](task.md) for the running task log and [REVIEW_AND_PLAN.md](REVIEW_AND_PLAN.md) for editor UI/UX roadmap.

## 📜 License

**Proprietary** — all rights reserved. Source is viewable here for evaluation only. Commercial licensing inquiries: `yapweijun1996@gmail.com`. See [LICENSE](LICENSE) for full terms.

Third-party components retain their own MIT / ISC / Apache-2.0 licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
