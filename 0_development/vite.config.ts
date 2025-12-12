import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Use repo-relative base path for production (GitHub Pages) so assets resolve under /Screen-Recorder-React-JS-Frontend/
  const base = mode === 'production' ? '/Screen-Recorder-React-JS-Frontend/' : '/';
  return {
    root: '.',
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Ensure SharedArrayBuffer is available for FFmpeg multi-threaded wasm
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    plugins: [react()],
    optimizeDeps: {
      // Prevent Vite from trying to pre-bundle FFmpeg worker assets
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core', '@ffmpeg/ffmpeg/dist/esm/worker.js'],
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
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
