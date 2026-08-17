/**
 * Collapse → expand leaves a world you can see. Phase-23 bugfix.
 *
 * The player reported it: press the far-right chevron to collapse, press it
 * again, and the world area is black. Reproduced deterministically — the
 * renderer came back sized to the COLLAPSED window (1920×48) inside the
 * expanded one (1920×220), so everything below the status bar was empty.
 *
 * Why nothing caught it: collapse/expand had geometry coverage (the WINDOW
 * resizes and stays docked) and leak coverage (GPU-gated, skipped here), but
 * nothing asserted that the thing inside the window matches the window. This
 * spec asserts exactly that, in the units a player experiences — a world
 * canvas as tall as the space it is supposed to fill.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

let session: IsolatedSession;
let app: ElectronApplication;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

/** The world canvas' backing size, and the window it has to fill. */
async function geometry(): Promise<{
  canvasWidth: number;
  canvasHeight: number;
  innerWidth: number;
  innerHeight: number;
}> {
  const window = await app.firstWindow();
  return window.evaluate(() => {
    const canvas = document.getElementById('world') as HTMLCanvasElement | null;
    return {
      canvasWidth: canvas?.clientWidth ?? -1,
      canvasHeight: canvas?.clientHeight ?? -1,
      innerWidth: globalThis.innerWidth,
      innerHeight: globalThis.innerHeight,
    };
  });
}

/** Waits for the overlay to settle at its expanded height. */
async function settle(ms = 2_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test('the world comes back the size of the window it comes back into', async () => {
  const window = await app.firstWindow();
  const chevron = window.getByRole('button', { name: /Collapse overlay|Expand overlay/ });

  await settle();
  const first = await geometry();
  expect(first.canvasHeight, 'the world fills the expanded window on launch').toBe(
    first.innerHeight,
  );

  // The player's gesture, twice: collapse, then expand.
  await chevron.click();
  await settle(1_000);
  await chevron.click();
  await settle();

  const after = await geometry();
  expect(after.innerHeight, 'the window itself expanded again').toBe(first.innerHeight);
  expect(after.canvasHeight, 'the world came back the size of its window').toBe(after.innerHeight);
  expect(after.canvasWidth).toBe(after.innerWidth);
});

test('it survives repeated collapse/expand cycles', async () => {
  const window = await app.firstWindow();
  const chevron = window.getByRole('button', { name: /Collapse overlay|Expand overlay/ });

  await settle();
  const expanded = (await geometry()).innerHeight;

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await chevron.click();
    await settle(700);
    await chevron.click();
    await settle(1_500);
    const geo = await geometry();
    expect(geo.canvasHeight, `cycle ${String(cycle + 1)} left the world mis-sized`).toBe(expanded);
  }
});
