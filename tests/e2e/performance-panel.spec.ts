/**
 * The performance panel, against the real app. Phase-07.8h.
 *
 * The unit tests drive a fake clock and a fake control. The one thing they
 * cannot prove is the property ADR-018 §8 actually cares about: that an OPEN
 * panel does not keep the render loop awake, and therefore does not inflate the
 * frame rate it is drawing. That needs the real loop, the real dirty gate, and
 * a real static world — which is exactly what `render-budget.spec.ts` asserts
 * for the game, and what this asserts for the panel measuring it.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

test('plots a live history of the running app', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F7');
  const panel = window.getByTestId('performance-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('last 60s');

  // Points accumulate as the window fills, oldest to the left.
  const fps = window.getByTestId('graph-fps');
  await expect
    .poll(
      async () => ((await fps.getAttribute('points')) ?? '').split(' ').filter(Boolean).length,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(2);
});

test('an open panel does not keep the frame loop awake (ADR-018 §8)', async () => {
  const window = await app.firstWindow();

  // The overlay reports drawn frames, not scheduled ones, so a static world
  // reads 0 fps. If the panel were requesting frames to animate its own
  // graphs, this number would rise the moment it opened — and every reading
  // the panel took would be measuring itself.
  await window.keyboard.press('F3');
  await window.keyboard.press('F7');
  await expect(window.getByTestId('performance-panel')).toBeVisible();

  // Let the world settle, then read what the overlay says the app is drawing.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const overlay = window.getByTestId('debug-overlay');
  await expect(overlay).toContainText('FPS');

  const fpsRow = (await overlay.textContent()) ?? '';
  const reported = Number.parseFloat(fpsRow.split('FPS')[1]?.trim().split(/\s/)[0] ?? 'NaN');

  // A static farm with two panels open still draws nothing.
  expect(reported).toBeLessThanOrEqual(1);
});
