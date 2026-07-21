import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * Three entry points with different targets (ADR-003 §7).
 *
 * Path aliases MUST stay in sync with the three tsconfig files — a mismatch
 * typechecks clean and then fails at bundle time.
 */
const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@sim': resolve(import.meta.dirname, 'src/sim'),
  '@persistence': resolve(import.meta.dirname, 'src/persistence'),
  '@render': resolve(import.meta.dirname, 'src/renderer/render'),
  '@ui': resolve(import.meta.dirname, 'src/renderer/app'),
  '@assets': resolve(import.meta.dirname, 'assets/dist'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/main/index.ts') },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        // MUST be CommonJS. This package is `"type": "module"`, so the default
        // output is ESM — and a sandboxed preload cannot be an ES module.
        // Electron fails it with "Cannot use import statement outside a
        // module", `window.desktopLife` is never defined, and the renderer
        // dies on first access. The app still launches and stays running, so
        // this is invisible to a smoke test; only E2E catches it.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },

  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') },
      },
    },
  },
});
