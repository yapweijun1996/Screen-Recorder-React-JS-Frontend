# PWA

ScreenClip Pro is installable and offline-capable. New versions install in the background and show a localized prompt. The user confirms when to reload; unsaved editor changes reset, so the prompt asks them to download their work first.

## Configuration and Update Flow

- `vite.config.ts`: `registerType: 'prompt'`, `injectRegister: false`, `skipWaiting: false`, `clientsClaim: true`.
- `src/registerSW.ts`: registers only in production, returns effect cleanup, and exposes `applyUpdate()`.
- `src/services/serviceWorkerUpdates.ts`: native registration and waiting/installing worker listeners; hourly and visibility-triggered update checks. Already-waiting workers also trigger the banner.
- `src/App.tsx`: localized banner in all ten languages; reload is disabled while `TaskActivity` reports active work.

A new worker remains waiting until an idle user clicks **Update and reload**. That sends `SKIP_WAITING`; the generated worker activates and claims clients. A `controllerchange` reloads only the confirming tab if it is still idle. If work starts during activation, or another tab activates the worker, this tab shows a prompt and waits for a new local confirmation. First installation never reloads the page.

Recording leases begin before permission prompts and remain through stop/finalization. Exports and IndexedDB restore/save/delete also acquire leases. Lease release is idempotent; effect cleanup removes service-worker listeners and periodic timers, including React StrictMode remounts.

## Manifest

Generated from `vite.config.ts → VitePWA.manifest`:

```json
{
  "name": "ScreenClip Pro",
  "short_name": "ScreenClip",
  "description": "Professional screen recording and video editing in your browser",
  "theme_color": "#0f172a",
  "background_color": "#0f172a",
  "display": "standalone",
  "orientation": "landscape",
  "scope": "./",
  "start_url": "./",
  "icons": [
    { "src": "favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

## Service Worker Caching

`workbox` (via `vite-plugin-pwa`) generates `dist/sw.js`. Behaviour:

- **Precache** — all build outputs matching `**/*.{js,css,html,svg,woff2}` (≤ 5 MB each)
- **`skipWaiting()` message + `clientsClaim()`** — activate only after confirmation; controller changes are checked against active work.
- **`cleanupOutdatedCaches()`** — old cache entries removed on activation
- **`NavigationRoute → index.html`** — SPA navigation requests served from the precached `index.html`

Asset URLs are hashed by Vite. The waiting worker does not take control until confirmation. Another tab can activate a new worker while this tab is busy; this tab postpones reloading and asks for local confirmation.

## Safe-area Handling

`body` in [`src/index.css`](../src/index.css):

```css
body {
    min-height: 100vh;
    min-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    box-sizing: border-box;
}

@media (orientation: landscape) {
    body {
        padding-top: max(env(safe-area-inset-top), 20px);
    }
}
```

Pairs with `<meta name="viewport" content="..., viewport-fit=cover">` — without the meta tag, `env()` returns `0px` and the notch / Dynamic Island cover content. The landscape floor handles iPhone 15+ home-indicator edge gestures (~20px outside the reported safe area).

## Standard Compliance Status

Cross-referenced against the **KB 2026 PWA checklist** (item `ccb5ae85`, verified 2026-05-10):

| Category | Status | Notes |
| --- | --- | --- |
| Manifest core (name/short_name/start_url/scope/display/colors) | ✅ | |
| Manifest `id` field | ❌ | Recommended 2024+ to prevent duplicate installs |
| Icons — PNG fallback (192 / 512 / 180 apple-touch) | ❌ | **Only SVG present.** iOS shows blank on home screen. |
| Maskable icon — separate file with safe zone | ❌ | Uses same SVG with `purpose: 'maskable'` — should be a padded PNG |
| iOS splash screens | ❌ | |
| `viewport-fit=cover` | ✅ | |
| `apple-mobile-web-app-capable` + `mobile-web-app-capable` | ✅ | Both present |
| `apple-mobile-web-app-status-bar-style` | ✅ | `black-translucent` |
| `env(safe-area-inset-*)` CSS | ✅ | With landscape floor |
| SW `skipWaiting` + `clientsClaim` | ✅ | |
| SW `cleanupOutdatedCaches` | ✅ | |
| **Confirmed update with active-work protection** | ✅ | Waiting worker → localized prompt → idle `SKIP_WAITING` → guarded controller change |
| Periodic update check | ✅ | 1-hour `setInterval` + `visibilitychange` |
| Offline fallback page (`offline.html`) | ⚠️ | Currently falls back to cached `index.html`. Dedicated `offline.html` is nicer. |
| `beforeinstallprompt` install button UI | ❌ | |
| Web Share API / Share Target | ❌ | Optional |
| File Handling | ❌ | Could register `.webm` / `.mp4` |
| Window Controls Overlay | ❌ | Desktop PWA polish |
| Badging API | ❌ | Not applicable for this app |

## What's Still Pending

In rough priority order for full standards compliance:

1. **PNG icons (192, 512, 180 apple-touch)** — biggest gap; iOS users see blank. Run favicon.svg through https://realfavicongenerator.net, drop the outputs into `public/`, and add a third entry to `manifest.icons`.
2. **Manifest `id`** — `"id": "/"` is enough to prevent the "two installs from one origin" quirk.
3. **`beforeinstallprompt` UI** — a single button that calls `deferredPrompt.prompt()`. Big install-rate lever.
4. **Dedicated `offline.html`** — nicer than serving the spinner with no data.

Update confirmation and safe-area behavior are implemented; remaining manifest/icon/install gaps are listed above.
