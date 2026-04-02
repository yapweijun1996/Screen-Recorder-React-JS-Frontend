# Architecture

## Overview

ScreenClip Pro is a client-side video recording and editing application. All processing (recording, compositing, encoding) happens in the browser — no backend required.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
│                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │ Recorder  │──▶│  IndexedDB    │──▶│     Editor      │ │
│  │  Phase    │   │  (auto-save)  │   │     Phase       │ │
│  └────┬─────┘   └──────────────┘   └───────┬─────────┘ │
│       │                                      │           │
│  ┌────▼─────┐                          ┌────▼─────┐    │
│  │ Media    │                          │WebCodecs │    │
│  │ Recorder │                          │+ mp4-mux │    │
│  │  API     │                          │ (encode) │    │
│  └──────────┘                          └──────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Application States

```
IDLE ──▶ RECORDING ──▶ PROCESSING ──▶ REVIEWING (Editor)
  ▲                                        │
  └────────────────────────────────────────┘
                  (Reset)
```

Managed by `AppStatus` enum in `src/types.ts`.

## Component Hierarchy

```
App
├── Header
│   ├── FFmpegStatus         # Engine loading state
│   ├── ThemeToggle           # Light/dark mode
│   └── LanguageSelector      # i18n
│
├── Recorder (IDLE state)
│   ├── RecorderSidebar       # Source & quality settings
│   │   └── useRecorderController  # MediaRecorder + stream logic
│   └── RecorderPreview       # Live video preview + controls
│       └── AudioLevelMeter   # Real-time mic visualization
│
└── Editor (REVIEWING state)
    ├── EditorHeader          # Title + "Record New" button
    └── EditorLayout          # FCP-style resizable panels
        ├── LibraryPanel      # Media browser + edit stats
        ├── EditorPlayer      # Video playback + seek bar
        ├── InspectorPanel    # Export settings + actions
        │   ├── EditorExportAdvancedSettings
        │   ├── EditorExportStatus
        │   └── EditorExportFooterActions
        └── ProTimeline       # Timeline ruler + clips + tools
            ├── TimelineToolbar   # Select / Blade / Hand tools
            ├── TimelineClip      # Segment visualization
            └── DraggablePlayhead # Seek control
```

## Key Services

### ExportService (`src/services/exportService.ts`)

Facade that manages the video export engine:

- **Init** — Detects WebCodecs capabilities via trial encode (avoids Firefox H.264 false positives)
- **Export** — Routes to the best available codec path:
  - **Chrome/Edge**: H.264 + AAC → MP4 via `mp4-muxer` (MIT)
  - **Firefox**: VP8 + Opus → WebM via `webm-muxer` (MIT)
- **Status callbacks** — Notifies UI of engine state (idle → loading → ready → error)

### WebCodecs Pipeline (`src/services/webcodecs/`)

- **capability.ts** — Trial-encodes a tiny frame to verify real H.264/VP8 support
- **webcodecExportService.ts** — Full export pipeline:
  1. Demux input WebM via `<video>` + `OffscreenCanvas` → `ImageBitmap` frames
  2. Decode audio via `OfflineAudioContext`
  3. Re-encode video with `VideoEncoder` (H.264 or VP8)
  4. Re-encode audio with `AudioEncoder` (AAC or Opus)
  5. Mux into MP4 or WebM container

### VideoStorageService (`src/services/videoStorageService.ts`)

IndexedDB wrapper for session persistence:

- **Save** — Stores video blob + duration after recording
- **Load** — Restores on page reload (auto-recovery)
- **Delete** — Cleans up after user resets

### StreamCompositor (`src/utils/StreamCompositor.ts`)

Canvas-based real-time stream composition:

- Overlays camera feed as PIP on screen capture
- Mixes system audio + microphone audio
- Handles pause/resume without stream interruption
- Draws rounded corners on PIP overlay

## State Management

No external state library — React hooks handle all state:

| Hook | Purpose |
|------|---------|
| `useRecorderController` | MediaRecorder lifecycle, stream setup, recording state |
| `useSegmentsEditor` | Segment CRUD, split/delete/undo with history stack (max 20) |
| `useKeyboardShortcuts` | J/K/L shuttle, Space play, B split, arrow seek |
| `useEditorExportController` | Export progress, ETA calculation, blob URL lifecycle |
| `useTheme` | Theme state + localStorage persistence |
| `useI18n` | Language state + translation lookup |

## Data Flow

### Recording

```
User clicks "Start Recording"
  → getDisplayMedia() + getUserMedia()
  → StreamCompositor (canvas overlay + audio mix)
  → MediaRecorder (WebM chunks)
  → Blob assembled on stop
  → IndexedDB save
  → Transition to Editor
```

### Editing & Export

```
User trims/splits segments in ProTimeline
  → useSegmentsEditor maintains segment array
  → User clicks "Export Trimmed"
  → exportService.processVideo(blob, segments, quality)
  → Demux WebM via <video> + OffscreenCanvas
  → VideoEncoder (H.264 or VP8) + AudioEncoder (AAC or Opus)
  → mp4-muxer or webm-muxer packages output
  → Progress callbacks update UI
  → Download link created from output blob
```

## Internationalization

- 10 locale files in `src/i18n/locales/`
- `I18nProvider` context with `t(key, params?)` function
- Language stored in `localStorage('screenclip.language')`
- Template interpolation: `{{variable}}` syntax in translation strings

## PWA

- `vite-plugin-pwa` generates service worker and manifest
- Static assets (JS/CSS/HTML/SVG) precached by Workbox
- No large WASM files to download — WebCodecs uses browser-native encoders
- `registerType: 'autoUpdate'` — new versions apply automatically

## Licensing

All dependencies are MIT or permissive:

| Package | License | Purpose |
|---------|---------|---------|
| react, vite, tailwindcss | MIT | Framework, build, styling |
| mp4-muxer | MIT | MP4 container packaging |
| webm-muxer | MIT | WebM container packaging (Firefox) |
| lucide-react | ISC | Icons |
| vite-plugin-pwa | MIT | PWA support |

**No GPL dependencies.** The project is fully commercial-use compatible.
