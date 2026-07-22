/**
 * Building placement, end to end. Phase-05d (acceptance criteria 15, 16, 20 —
 * the build-mode + ghost deliverable).
 *
 * Drives the REAL app along the whole placement path: the build button arms a
 * shed → the pointer drives the ghost → a click travels player source →
 * dispatcher → tick → the shed's container opens → the inventory slice grows.
 * No privileged shortcut anywhere (ADR-010 §6).
 *
 * The placed shed renders in PixiJS, which this environment cannot assert at the
 * pixel level (no WebGL/WebGPU adapter — see the worker suite). The proof used
 * here is instead DOM-observable and stronger: a storage shed OWNS a 50-slot
 * container, and the inventory slice aggregates every building's storage into
 * its capacity — so a successful placement raises the readout from 40 to 90.
 */

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;

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

test.beforeEach(async () => {
  app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await app.close();
});

test('placing a shed arms the ghost and opens storage', async () => {
  const window = await app.firstWindow();
  await setCollapsed(false);

  // The inventory starts at the 40-slot base, no buildings.
  const inventory = window.getByRole('button', { name: /^Inventory/ });
  await expect(inventory).toContainText('0/40');

  // Arm placement. The button flips to its active label.
  const build = window.getByRole('button', { name: /shed/i });
  await expect(build).toHaveText('Build shed');
  await build.click();
  await expect(build).toHaveText('Placing shed…');
  await expect(build).toHaveAttribute('aria-pressed', 'true');

  // The plot centre is framed at the viewport centre; hover it so the ghost
  // follows, then capture the armed state.
  const size = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await new Promise((resolve) => setTimeout(resolve, 300)); // let the world mount
  await window.mouse.move(size.w / 2, size.h / 2);
  await window.screenshot({ path: 'test-results/placement-ghost.png' });

  // Click to place. It dispatches placeBuilding; the shed lands on the next tick
  // and its container joins the inventory aggregate, so capacity rises to 90.
  await window.mouse.click(size.w / 2, size.h / 2);
  await expect(inventory).toContainText('0/90');

  await window.screenshot({ path: 'test-results/placement-done.png' });

  // Esc disarms; the button returns to its resting label.
  await window.keyboard.press('Escape');
  await expect(build).toHaveText('Build shed');
  await expect(build).toHaveAttribute('aria-pressed', 'false');
});
