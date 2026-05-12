# PWA

ScreenClip Pro is a Progressive Web App: installable, offline-capable, and configured to **force-reload open tabs when a new version is deployed**. This document explains the configuration and what's still pending for full 2026 standard compliance.

## Configuration Layer

| File | Role |
| --- | --- |
| [`vite.config.ts`](../vite.config.ts) | `VitePWA` plugin config: manifest, workbox glob, `registerType: 'autoUpdate'`, `injectRegister: false` |
| [`index.html`](../index.html) | `<meta>` tags: `viewport-fit=cover`, `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, status bar style, apple-touch-icon |
| [`src/registerSW.ts`](../src/registerSW.ts) | Custom service-worker registration with `onNeedRefresh → updateSW(true)` for force-reload |
| [`src/index.tsx`](../src/index.tsx) | Calls `setupServiceWorker()` after React mounts |
| [`src/index.css`](../src/index.css) | `body` padding via `env(safe-area-inset-*)` + landscape floor for home-indicator gestures |

## Auto-Update Flow (force-reload)

The user's tab gets the new code on the next visibility tick after deploy, **without manual refresh**.

```
┌─────────────────────────────────────────────────────────────────────┐
│ user has tab open running old code                                  │
│                                                                     │
│ visibilitychange (returns to tab)                                   │
│      OR setInterval (1 hour)                                        │
│      OR initial registration                                        │
│              │                                                      │
│              ▼                                                      │
│ registration.update() → workbox checks server for new sw.js         │
│              │                                                      │
│              ▼  (new SW found, installs in background)              │
│      onNeedRefresh fires                                            │
│              │                                                      │
│              ▼                                                      │
│ updateSW(true)                                                      │
│   ├─ posts SKIP_WAITING to new SW                                   │
│   ├─ new SW activates (skipWaiting + clientsClaim)                  │
│   ├─ controllerchange fires in workbox-window                       │
│   └─ window.location.reload()        ← user sees new code           │
└─────────────────────────────────────────────────────────────────────┘
```

The registration logic ([`registerSW.ts`](../src/registerSW.ts)) sets up three triggers:

1. **Initial** — `registerSW({ immediate: true })` checks on app load
2. **Periodic** — `setInterval(() => registration.update(), 1h)` for long-lived tabs
3. **Visibility** — `visibilitychange` to `visible` re-checks (catches "tab was backgrounded during deploy")

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
- **`skipWaiting()` + `clientsClaim()`** — new SW activates immediately (paired with the force-reload above, this is safe)
- **`cleanupOutdatedCaches()`** — old cache entries removed on activation
- **`NavigationRoute → index.html`** — SPA navigation requests served from the precached `index.html`

Asset URLs are hashed by Vite (e.g., `index-C1kw5Y6u.js`), so old tabs running old hashes don't 404 when the new SW activates — the old chunk is still in the previous cache long enough for the open tab to finish what it's doing before the force-reload swaps it.

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
| **Auto-update with forced reload** | ✅ | `onNeedRefresh → updateSW(true)` |
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

The auto-update and safe-area behavior (the parts the user asked about) are already standard-compliant.
