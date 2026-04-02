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
│  │ Media    │                          │ FFmpeg   │    │
│  │ Recorder │                          │  .wasm   │    │
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

### FFmpegService (`src/services/ffmpegService.ts`)

Singleton that manages FFmpeg.wasm lifecycle:

- **Preload** — Downloads and initializes the WASM binary on app mount
- **Fix WebM duration** — Remuxes raw MediaRecorder output to fix missing duration metadata
- **Export** — Encodes trimmed/concatenated segments to MP4 or WebM with quality presets
- **Status callbacks** — Notifies UI of loading state (idle → loading → loaded → error)

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
  → FFmpegService.fixWebmDuration()
  → IndexedDB save
  → Transition to Editor
```

### Editing & Export

```
User trims/splits segments in ProTimeline
  → useSegmentsEditor maintains segment array
  → User clicks "Export Trimmed"
  → FFmpegService.processVideo(blob, segments, quality)
  → FFmpeg extracts each segment → concatenates → encodes
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
- FFmpeg WASM files excluded from precache (too large, loaded on demand)
- `registerType: 'autoUpdate'` — new versions apply automatically
