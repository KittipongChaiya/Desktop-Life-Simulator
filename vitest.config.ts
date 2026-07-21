import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/renderer/index.html'],
      // Thresholds per TESTING.md §4. Raised progressively as phases land;
      // src/sim reaches 90% once systems exist (phase-03+).
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
  },
});
