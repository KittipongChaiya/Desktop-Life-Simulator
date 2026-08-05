/**
 * The pathfinding overlay, against the real app. Phase-07.8j.
 *
 * Same obligation as the chunk overlay: it draws into the scene, so the thing
 * worth proving is that it obeys ADR-001. The heatmap is the harder case —
 * it fills every visible tile, so if any in-world debug drawing were going to
 * hold the render loop awake, this is the one that would.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

async function setCollapsed(collapsed: boolean): Promise<void> {
  const window = await app.firstWindow();
  await window.evaluate(async (value: boolean) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(value);
  }, collapsed);
}

/** FPS as the debug overlay reports it. Drawn frames, not scheduled ones. */
async function reportedFps(): Promise<number> {
  const window = await app.firstWindow();
  const text = (await window.getByTestId('debug-overlay').textContent()) ?? '';
  return Number.parseFloat(text.split('FPS')[1]?.trim().split(/\s/)[0] ?? 'NaN');
}

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await setCollapsed(false);
});

test.afterEach(async () => {
  await session.dispose();
});

test('routes and the heatmap draw without waking the frame loop (ADR-001)', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F3');

  // Off → routes.
  await window.keyboard.press('F9');
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(await reportedFps()).toBeLessThanOrEqual(1);

  // Routes → routes and heatmap, which fills every visible tile.
  await window.keyboard.press('F9');
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await reportedFps()).toBeLessThanOrEqual(1);

  // And back to off, so the cycle is a cycle.
  await window.keyboard.press('F9');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  expect(await reportedFps()).toBeLessThanOrEqual(1);
});

test('the overlay survives the scene being destroyed and rebuilt', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F3');
  await window.keyboard.press('F9');
  await new Promise((resolve) => setTimeout(resolve, 800));

  await setCollapsed(true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await setCollapsed(false);

  await expect(window.locator('[title="Simulation uptime"]')).toBeVisible();
  // The rebuilt scene draws once and goes quiet, with the overlay still on.
  await expect.poll(async () => await reportedFps(), { timeout: 10_000 }).toBeLessThanOrEqual(1);
});
