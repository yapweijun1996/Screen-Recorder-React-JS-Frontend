# ScreenClip Pro

A professional, browser-based screen recording and video editing application. All processing happens client-side — no server, no uploads, complete privacy.

**Built and maintained by [yapweijun1996](https://github.com/yapweijun1996)**

## Features

- **Screen Recording** — Capture screen, window, or tab with system audio
- **Camera Overlay (PIP)** — Draggable, resizable picture-in-picture webcam overlay with rounded corners
- **Microphone Audio** — Record voiceover with mic input mixing
- **Video Editing** — Timeline-based trimming, segment split/delete, undo history
- **Professional Timeline** — Zoomable ruler, draggable playhead, keyboard shortcuts (J/K/L shuttle, B split, Space play/pause)
- **Quality Presets** — Low / Medium / High / Lossless with configurable CRF, bitrate, and FPS
- **Export to MP4/WebM** — Client-side FFmpeg.wasm encoding with progress and ETA
- **Auto-Save** — Recordings persist in IndexedDB for session recovery
- **PWA Support** — Installable as a standalone desktop/mobile app with offline caching
- **Light / Dark Mode** — Toggle theme with system preference detection and persistence
- **11 Languages** — English, 中文, Deutsch, Español, Français, हिन्दी, Bahasa Indonesia, 日本語, 한국어, Português

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 + CSS Variables (theme system) |
| Video Processing | FFmpeg.wasm (client-side WebAssembly) |
| Icons | Lucide React |
| Storage | IndexedDB (browser-native) |
| PWA | vite-plugin-pwa + Workbox |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Install & Run

```bash
cd 0_development
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

### Important: SharedArrayBuffer

FFmpeg.wasm requires `SharedArrayBuffer`, which needs these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are pre-configured in `vite.config.ts` for both dev and preview servers. For production deployment (e.g., GitHub Pages), ensure your hosting platform supports these headers.

## Project Structure

```
0_development/
├── public/
│   ├── favicon.svg              # SVG app icon
│   ├── ffmpeg/                  # FFmpeg.wasm single-threaded
│   └── ffmpeg-mt/               # FFmpeg.wasm multi-threaded
├── src/
│   ├── components/
│   │   ├── editor/              # Editor UI (timeline, trim, export)
│   │   │   └── exportPanel/     # Export settings & status sub-components
│   │   ├── recorder/            # Recorder UI (sidebar, preview, controls)
│   │   ├── ThemeToggle.tsx      # Light/dark mode toggle button
│   │   ├── Button.tsx           # Shared button component
│   │   └── ...
│   ├── context/
│   │   └── ThemeContext.tsx      # Theme state management & persistence
│   ├── services/
│   │   ├── ffmpegService.ts     # FFmpeg.wasm wrapper
│   │   └── videoStorageService.ts  # IndexedDB persistence
│   ├── utils/
│   │   ├── StreamCompositor.ts  # Canvas-based PIP composition
│   │   └── format.ts            # Time/byte formatting helpers
│   ├── i18n/                    # Internationalization (10 locales)
│   ├── types.ts                 # Shared TypeScript definitions
│   ├── index.css                # Theme CSS variables + animations
│   └── App.tsx                  # Root component
├── vite.config.ts               # Vite + PWA configuration
├── tailwind.config.js           # Tailwind theme + semantic colors
└── tsconfig.json                # TypeScript config
```

## Theme System

ScreenClip Pro supports light and dark mode with automatic system preference detection.

- **CSS Variables** in `src/index.css` define color tokens for both themes
- **Tailwind `th-*` colors** in `tailwind.config.js` map to CSS variables
- **ThemeContext** persists preference to `localStorage`
- **No flash** — inline script in `index.html` applies theme before React hydrates

See [docs/THEMING.md](docs/THEMING.md) for the full color token reference.

## Keyboard Shortcuts (Editor)

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `J` / `L` | Shuttle backward / forward |
| `K` | Pause |
| `←` / `→` | Jump 1 frame |
| `Shift + ←` / `→` | Jump 1 second |
| `B` | Split at playhead |
| `Delete` | Remove selected segment |
| `Ctrl + Z` | Undo |

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 89+ | Full |
| Edge 89+ | Full |
| Firefox 79+ | Full (SharedArrayBuffer required) |
| Safari 15.2+ | Partial (no SharedArrayBuffer without flags) |

## License

MIT
