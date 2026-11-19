import path from 'path';
import { execFileSync } from 'node:child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function localGitVersion() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'local';
  } catch {
    return 'local';
  }
}

function versionScriptName(buildVersion: string) {
  const safeVersion = buildVersion.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 128) || 'local';
  return `pwa-version-${safeVersion}.js`;
}

function pwaVersionPlugin(buildVersion: string, versionScript: string): Plugin {
  return {
    name: 'screenclip-pwa-version',
    generateBundle() {
      const source = [
        `const SCREENCLIP_BUILD_VERSION = ${JSON.stringify(buildVersion)};`,
        "self.addEventListener('message', (event) => {",
        "  if (event.data?.type !== 'GET_BUILD_VERSION') return;",
        "  const response = { type: 'BUILD_VERSION', version: SCREENCLIP_BUILD_VERSION };",
        "  const port = event.ports?.[0];",
        "  if (port) { port.postMessage(response); return; }",
        "  if (event.source && typeof event.source.postMessage === 'function') event.source.postMessage(response);",
        '});',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: versionScript, source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildVersion = process.env.GITHUB_SHA || env.GITHUB_SHA ||
    process.env.VITE_BUILD_VERSION || env.VITE_BUILD_VERSION || localGitVersion();
  const versionScript = versionScriptName(buildVersion);
  const base = './';
  return {
    root: '.',
    base,
    define: {
      __SCREENCLIP_BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      pwaVersionPlugin(buildVersion, versionScript),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [
          'favicon.svg',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/maskable-icon-512.png',
          'icons/apple-touch-icon.png',
        ],
        manifest: {
          name: 'ScreenClip Pro',
          short_name: 'ScreenClip',
          id: base,
          description: 'Professional screen recording and video editing in your browser',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'landscape',
          scope: base,
          start_url: base,
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/maskable-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: false,
          clientsClaim: true,
          importScripts: [versionScript],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,txt}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    },
    worker: {
      format: 'es',
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    }
  };
});
