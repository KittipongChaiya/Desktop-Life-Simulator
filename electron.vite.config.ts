import { resolve } from 'node:path';

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
      },
    },
  },

  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') },
      },
    },
  },
});
