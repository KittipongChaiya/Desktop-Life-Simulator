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

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
/** The throwaway profile this spec runs on (07e — the app saves itself now). */
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

/**
 * Grants coins through the devtools console's `money` command — the declared
 * dev-only source (06c). Placement charges real coins now (a shed is 200
 * against the 100-coin start), so the suite funds itself the way a developer
 * would.
 */
async function grantCoins(amount: number): Promise<void> {
  const window = await app.firstWindow();
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill(`money ${String(amount)}`);
  await input.press('Enter');
  await window.keyboard.press('F1');
  // The grant applies on the next simulation tick (50 ms); let it land before
  // any dispatch validates against the balance.
  await new Promise((resolve) => setTimeout(resolve, 250));
}

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await grantCoins(5_000);
});

test.afterEach(async () => {
  await session.dispose();
});

test('placing a shed arms the ghost and opens storage', async () => {
  const window = await app.firstWindow();
  await setCollapsed(false);

  // The inventory starts at the 40-slot base, no buildings.
  const inventory = window.getByRole('button', { name: /^Inventory/ });
  await expect(inventory).toContainText('0/40');

  // Arm placement from the shop (06e — buildings buy from the ShopPanel).
  // The accessible name is stable across states; the visible text flips.
  await window.getByRole('button', { name: 'Shop' }).click();
  const build = window.getByRole('button', { name: 'Build Storage Shed' });
  await build.click();
  await expect(build).toHaveText('Placing…');
  await expect(build).toHaveAttribute('aria-pressed', 'true');

  // The plot centre is framed at the viewport centre; hover it so the ghost
  // follows, then capture the armed state.
  const centre = await plotCentreOnScreen(window);
  await new Promise((resolve) => setTimeout(resolve, 300)); // let the world mount
  await window.mouse.move(centre.x, centre.y);
  await window.screenshot({ path: 'test-results/placement-ghost.png' });

  // Click to place. It dispatches placeBuilding; the shed lands on the next tick
  // and its container joins the inventory aggregate, so capacity rises to 90.
  await window.mouse.click(centre.x, centre.y);
  await expect(inventory).toContainText('0/90');

  await window.screenshot({ path: 'test-results/placement-done.png' });

  // Esc disarms; the button returns to its resting label.
  await window.keyboard.press('Escape');
  await expect(build).toHaveText('Build');
  await expect(build).toHaveAttribute('aria-pressed', 'false');
});
