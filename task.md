# Task Log

Running log of meaningful changes to ScreenClip Pro. Structured records live in [task.jsonl](task.jsonl) (one JSON object per line, append-only, easy to grep/`jq`).

Newest first.

---

## 2026-05-12 — Streaming WebCodecs export

**Status:** ✅ shipped (`f84e894`)

Rewrote [`src/services/webcodecs/webcodecExportService.ts`](src/services/webcodecs/webcodecExportService.ts) from a seek-per-frame demux into a streaming `requestVideoFrameCallback` pipeline.

- **Before:** 38 s clip → ~40 minutes export on Chrome, multi-GB RAM peak
- **After:** 38 s clip → ~3 s export, ~50 MB constant RAM
- **How:** `<video>.playbackRate = 16` + `requestVideoFrameCallback` drives a 2-bitmap rolling buffer; each captured frame feeds into `VideoEncoder` inline via nearest-neighbour deadline matching, then the `VideoFrame` is closed immediately
- **Fallback:** old seek-based path retained for browsers without `requestVideoFrameCallback`

Docs: [docs/EXPORT_PIPELINE.md](docs/EXPORT_PIPELINE.md)

---

## 2026-05-12 — PWA 2026 standards compliance

**Status:** ✅ shipped (`1ff19b9`)

- Added `viewport-fit=cover` + `mobile-web-app-capable` meta tags ([`index.html`](index.html))
- Added `env(safe-area-inset-*)` body padding + landscape floor for iPhone notch/home-indicator ([`src/index.css`](src/index.css))
- Replaced silent `autoUpdate` with custom [`registerSW.ts`](src/registerSW.ts) that force-reloads on new SW + polls hourly + re-checks on `visibilitychange`
- Added `vite-plugin-pwa/client` types to [`src/vite-env.d.ts`](src/vite-env.d.ts)

Docs: [docs/PWA.md](docs/PWA.md)

---

## 2026-05-12 — Legacy v1 code removal

**Status:** ✅ shipped (`1ff19b9`)

Deleted root-level v1 React app:

- `App.tsx`, `index.tsx`, `index.css`, `types.ts` (root duplicates)
- `components/Button.tsx`, `components/Editor.tsx`, `components/RangeSlider.tsx`, `components/Recorder.tsx`
- `services/ffmpegService.ts`
- `utils/StreamCompositor.ts`, `utils/format.ts`

Net: **-1259 / +69 lines**. Live entry has been `src/index.tsx` for some time; root files were stale duplicates that still referenced GPL FFmpeg.

Also:

- Dropped "FFmpeg.wasm" from all 9 non-English locale footers
- Renamed `VideoQualityConfig.ffmpegPreset` → `encoderPreset`
- Updated `metadata.json` description to mention WebCodecs instead of WebAssembly

---

## 2026-05-12 — Commercial licensing prep

**Status:** ✅ shipped (`7d4ba16`)

- **Removed GPL `ffmpeg.wasm` binaries** from `public/ffmpeg/` and `public/ffmpeg-mt/` (~64 MB of `.wasm` + JS shims). Already replaced with WebCodecs + MIT muxers in earlier commit `562e118`, but the binaries were still shipped in `dist/`.
- Added proprietary [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Set `"license": "SEE LICENSE IN LICENSE"` in [package.json](package.json)
- Fixed Chrome `MediaRecorder` WebM `duration = Infinity` quirk in [`webcodecExportService.ts`](src/services/webcodecs/webcodecExportService.ts) (seek-to-large-number trick before reading duration)

---

## Pending / Backlog

| Priority | Task | Notes |
| --- | --- | --- |
| 🟡 P1 | Generate PNG icons (192/512/180 apple-touch + maskable) | iOS home-screen shows blank without these |
| 🟡 P1 | Wire CRF UI control to bitrate scale OR remove the slider | Currently UI-only; user changes have no effect |
| 🟢 P2 | `beforeinstallprompt` install button | Big install-rate lever |
| 🟢 P2 | Manifest `id` field | Prevents duplicate installs |
| 🟢 P2 | Dedicated `offline.html` | Currently falls back to cached `index.html` |
| 🟢 P2 | Remove dead `ffmpeg.*` / `engine.ready.*` i18n keys | Harmless but confusing for translators |
| 🟢 P2 | Sentry / error monitoring for commercial deploy | |
| 🟢 P2 | Brand / white-label config via env vars | For multi-customer resale |

See also [REVIEW_AND_PLAN.md](REVIEW_AND_PLAN.md) for editor UI/UX roadmap.
