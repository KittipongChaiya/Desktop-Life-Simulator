import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@sim': resolve(import.meta.dirname, 'src/sim'),
      '@persistence': resolve(import.meta.dirname, 'src/persistence'),
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
