import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

import pkg from './package.json' with { type: 'json' };

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
  '@devtools': resolve(import.meta.dirname, 'src/devtools'),
};

/**
 * Build-time constants.
 *
 * Feature flags are injected as LITERAL booleans, not computed at runtime.
 * That is the whole mechanism: `if (__FEATURE_DEBUG__)` becomes `if (false)` in
 * a production build, and Rollup drops the branch and every module it reaches —
 * including the dynamically-imported devtools chunks. A runtime boolean would
 * ship the entire console, overlay, profiler, and inspector to players.
 *
 * Verified by tests/devtools-excluded-from-production.test.ts.
 */
function buildDefines(isProduction) {
  const override = (name, fallback) => {
    const value = process.env[name];
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  };

  const debug = override('VITE_FEATURE_DEBUG', !isProduction);

  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __FEATURE_DEBUG__: JSON.stringify(debug),
    __FEATURE_PROFILER__: JSON.stringify(debug && override('VITE_FEATURE_PROFILER', true)),
    __FEATURE_CONSOLE__: JSON.stringify(debug && override('VITE_FEATURE_CONSOLE', true)),
    __FEATURE_INSPECTOR__: JSON.stringify(debug && override('VITE_FEATURE_INSPECTOR', true)),
  };
}

export default defineConfig(({ command }) => {
  const define = buildDefines(command === 'build');

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias },
      define,
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
      define,
      server: {
        watch: {
          // ASSET HOT RELOAD (phase-01.5 deliverable 5). Generated atlases live
          // outside the renderer root, so Vite does not watch them by default.
          // With this, `npm run assets:watch` regenerates an atlas and the HMR
          // client pushes it without an app restart.
          //
          // Dev-server only: `server` config has no effect on a production
          // build, so this cannot leak into a shipped app.
          ignored: ['!**/assets/dist/**'],
        },
      },
      build: {
        rollupOptions: {
          input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') },
        },
      },
    },
  };
});
