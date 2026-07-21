/**
 * Phase-01 acceptance criterion 11 — THE most important E2E test in this phase.
 *
 * Chromium throttles background renderer timers to ~1 Hz. "Backgrounded" is
 * this product's NORMAL state: the entire premise is that you leave it running
 * while you work in another application (VISION.md §2.1). Without
 * `backgroundThrottling: false` the simulation silently stalls whenever the
 * player does their actual job — and it is nearly invisible in casual testing,
 * because the moment you look at the overlay it starts ticking again.
 *
 * If this test is deleted or skipped, ADR-003 §2 is unenforced.
 */

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { TICKS_PER_SECOND } from '../../src/shared/constants';

let app: ElectronApplication;

test.beforeEach(async () => {
  app = await electron.launch({ args: ['.'] });
});

test.afterEach(async () => {
  await app.close();
});

/** Reads the simulation tick from the renderer's status slice. */
async function readTick(): Promise<number> {
  const window = await app.firstWindow();
  return window.evaluate(() => {
    const text = document.querySelector('[title="Simulation ticks elapsed"]')?.textContent ?? '0';
    return Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
  });
}

test('the simulation keeps ticking while the window is not focused', async () => {
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation ticks elapsed"]');

  // Blur the window, the way switching to another application would.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.blur();
  });

  const before = await readTick();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const after = await readTick();

  const elapsed = after - before;

  // 3 seconds at 20 Hz is ~60 ticks. A throttled renderer would advance ~3.
  // The generous floor tolerates scheduling jitter while still failing hard on
  // 1 Hz throttling, which is the actual regression being guarded against.
  expect(elapsed).toBeGreaterThan(TICKS_PER_SECOND * 1.5);
});

test('the simulation keeps ticking while the window is hidden', async () => {
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation ticks elapsed"]');

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.hide();
  });

  const before = await readTick();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const after = await readTick();

  expect(after - before).toBeGreaterThan(TICKS_PER_SECOND * 1.5);
});

test('backgroundThrottling is disabled on the overlay window', async () => {
  // Wait for the window to exist: without this, getAllWindows() is empty and
  // the assertion fails for the wrong reason.
  await app.firstWindow();

  // Direct assertion on the setting, so a regression is diagnosable even if the
  // timing assertions above go flaky on a loaded CI machine.
  const disabled = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.webContents.getBackgroundThrottling() === false;
  });

  expect(disabled).toBe(true);
});
