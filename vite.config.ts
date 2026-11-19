import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const base = './';
  return {
    root: '.',
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
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
    build: {
      outDir: 'dist',
      sourcemap: true,
    }
  };
});
