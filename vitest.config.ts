import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { AREA_THRESHOLDS, HOST_BINDINGS, PROJECT_THRESHOLD } from './coverage-policy.config';

export default defineConfig({
  // Required for the automatic JSX runtime in component tests; without it JSX
  // compiles to classic `React.createElement` and every render throws
  // "React is not defined".
  plugins: [react()],
  // Tests exercise the developer tooling, so the flags are on. The production
  // exclusion is asserted separately against a real build artifact.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __FEATURE_DEBUG__: 'true',
    __FEATURE_PROFILER__: 'true',
    __FEATURE_CONSOLE__: 'true',
    __FEATURE_INSPECTOR__: 'true',
  },
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@sim': resolve(import.meta.dirname, 'src/sim'),
      '@persistence': resolve(import.meta.dirname, 'src/persistence'),
      '@devtools': resolve(import.meta.dirname, 'src/devtools'),
      // Declared by `electron.vite.config` and both renderer tsconfigs, and
      // missing here until 07.8d — no test had yet imported a RUNTIME module
      // through it, only types, which erase before resolution. An alias the
      // build honours and the tests do not is a module the tests cannot cover.
      '@render': resolve(import.meta.dirname, 'src/renderer/render'),
      // Component tests mount panels that CSS-slice the packed atlas (06e).
      '@assets': resolve(import.meta.dirname, 'assets/dist'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    // E2E runs under Playwright, not Vitest.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    // Boundary tests shell out to ESLint with type-aware rules; the default
    // 5s timeout is not enough for the first run that warms the TS program.
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // `plugins/**` is measured from phase-08.0, BEFORE phase-08 puts anything
      // in it. Core content registration moves out of `src/sim` and into
      // `plugins/core/` there (ADR-019); an unmeasured destination would drop
      // well-covered lines out of the total on a pure refactor, which is the
      // drift this phase exists to end.
      include: ['src/**/*.ts', 'src/**/*.tsx', 'plugins/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'plugins/**/*.test.ts',
        'src/renderer/index.html',
        // Host bindings, each with a named detector. The register and the
        // criterion admitting anything to it: `coverage-policy.config.ts`.
        ...HOST_BINDINGS.map((binding) => binding.path),
      ],
      // Every threshold in one place, checked against TESTING.md §4 by
      // `tests/coverage-policy.test.ts`. Before phase-08.0 this object held a
      // single global pair while §4 declared seven per-area rows, so six of them
      // had never been enforced.
      thresholds: {
        lines: PROJECT_THRESHOLD.lines,
        branches: PROJECT_THRESHOLD.branches,
        ...Object.fromEntries(
          AREA_THRESHOLDS.map((area) => [
            area.glob,
            { lines: area.lines, branches: area.branches },
          ]),
        ),
      },
    },
  },
});
