import { defineConfig } from '@playwright/test';

/**
 * E2E configuration.
 *
 * These tests launch the REAL packaged app. They are the only place overlay
 * behavior can be verified at all — window geometry, always-on-top, and
 * background throttling have no unit-testable surface.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Refuses to start against a build with no devtools, rather than letting the
  // console-driven specs each time out for 30 s explaining nothing. See the
  // file's header — this exact failure was misdiagnosed as spec-ordering.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // a single-instance-locked desktop app
  workers: 1,
  retries: 0, // a flaky overlay test is a real bug (TESTING.md §6.4)
  timeout: 60_000,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
