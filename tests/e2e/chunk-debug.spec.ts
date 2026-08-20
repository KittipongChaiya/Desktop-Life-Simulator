/**
 * The chunk overlay, against the real app. Phase-07.8i.
 *
 * This is the first debug tool that draws into the SCENE, so the thing worth
 * proving is not that it appears — a screenshot shows that — but that it obeys
 * ADR-001. An overlay that dirtied the gate to keep its numbers fresh would
 * hold the render loop awake forever, and it would do it in the build the
 * developer is staring at, where it looks like the tool working.
 *
 * So: turn it on, let the world settle, and assert the app still draws nothing.
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

/** Chunk redraws reported by the F3 overlay. Zero on a cached frame. */
async function chunkRedraws(): Promise<number> {
  const window = await app.firstWindow();
  const text = (await window.getByTestId('debug-overlay').textContent()) ?? '';
  return Number.parseInt(text.split('Chunk Redraws')[1]?.trim().split(/\s/)[0] ?? 'NaN', 10);
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

/** The FPS the overlay reports, averaged over the loop's 500 ms window. */
async function fps(): Promise<number> {
  const window = await app.firstWindow();
  const text = (await window.getByTestId('debug-overlay').textContent()) ?? '';
  return Number.parseFloat(text.split('FPS')[1]?.trim().split(/\s/)[0] ?? 'NaN');
}

test('the chunk overlay does not keep the frame loop awake (ADR-001)', async () => {
  const window = await app.firstWindow();

  // F3 for the readout, F8 for the overlay.
  await window.keyboard.press('F3');
  await window.keyboard.press('F8');

  // POLLED for reaching idle, then asserted for STAYING idle.
  //
  // This read a single sample after a fixed 2,500 ms sleep, and flaked: the
  // world does not always settle in that time. Terrain chunks bake
  // progressively and decor is planned once the grid is up, and the FPS
  // figure is an average over the loop's 500 ms window — so a run whose
  // settling ran 300 ms long reported the tail of the STARTUP burst, not the
  // steady state. Measured over ten launches: seven reported 0, and three
  // reported 66.7, 56.9 and 18 with the gate already saying `no · 0 anim`.
  //
  // The distinction matters, because "has not settled yet" and "never
  // settles" are different claims and only the second is a defect. Waiting
  // for idle and then requiring it to HOLD tests the second — which is what
  // this spec is about — and is strictly stronger than one sample was.
  await expect
    .poll(fps, { timeout: 30_000, message: 'the world never reached a quiet frame loop' })
    .toBeLessThanOrEqual(1);

  // Held, with the overlay ON. An overlay that dirtied the gate to keep its
  // numbers fresh would show up here rather than in the poll above.
  await window.waitForTimeout(2_000);
  expect(await fps(), 'the chunk overlay woke the frame loop back up').toBeLessThanOrEqual(1);

  // Chunk redraws fall to zero on a cached frame, and stay there with the
  // overlay ON — the overlay samples the stale set, it does not create one.
  expect(await chunkRedraws()).toBe(0);
});

test('the overlay is destroyed and rebuilt with the scene, and settles quiet', async () => {
  // Collapsing destroys the whole scene, including this overlay's container
  // and its per-chunk text objects. Rebuilding it is where a scene-drawing
  // tool leaks GPU objects or throws on a stale reference — and the toggle is
  // held OUTSIDE the view precisely so the rebuilt scene comes back with the
  // overlay still on.
  const window = await app.firstWindow();

  await window.keyboard.press('F3');
  await window.keyboard.press('F8');
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  await setCollapsed(true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await setCollapsed(false);

  // The rebuilt scene draws its terrain once and then goes quiet again.
  await expect(window.locator('[title="Simulation uptime"]')).toBeVisible();
  await expect.poll(async () => await chunkRedraws(), { timeout: 10_000 }).toBe(0);
});
