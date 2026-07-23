/**
 * Worker hiring, end to end. Phase-04c (acceptance criteria 1, 19; the hire-
 * button UI deliverable).
 *
 * Drives the REAL app: clicking Hire must travel button → player command source
 * → dispatcher → simulation tick → worker snapshot → HUD, and come back as a
 * rising worker count. This is the whole control path phase-04 installed, with
 * no privileged shortcut anywhere (ADR-010 §6).
 *
 * Pixel-level sprite rendering is not asserted here: this environment has no
 * WebGL/WebGPU adapter (Pixi falls back to Canvas), the same limitation the
 * render-budget suite documents — and the plot sits at world-centre, off the
 * 220px overlay's vertical view. The rendering maths is unit-tested in
 * `src/renderer/render/worker-render.test.ts`.
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

/**
 * Grants coins through the devtools console's `money` command — the declared
 * dev-only source (06c). Hiring charges real coins now, and `hireCost(0)` =
 * 150 > the 100-coin start: a fresh farm cannot hire until it sells, so the
 * suite funds itself the way a developer would.
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
  app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await grantCoins(5_000);
});

test.afterEach(async () => {
  await app.close();
});

test('hiring a worker through the HUD raises the worker count', async () => {
  const window = await app.firstWindow();
  const count = window.locator('[title="Workers hired"]');

  // A fresh world has no workers.
  await expect(count).toHaveText('0 workers');

  // Expand so the farm controls (and the world view) mount.
  await setCollapsed(false);
  const hire = window.getByRole('button', { name: /^Hire/ });
  await expect(hire).toBeVisible();

  // Each click dispatches a hireWorker command; it applies on the next tick and
  // the snapshot re-publishes, so the count rises. `toHaveText` retries, which
  // absorbs the tick-boundary latency.
  await hire.click();
  await expect(count).toHaveText('1 worker');

  await hire.click();
  await expect(count).toHaveText('2 workers');

  // Let the workers spawn on the (now centred) plot and start farming, then
  // capture a visual record of the running overlay.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await window.screenshot({ path: 'test-results/worker-hire.png' });
});

test('clicking a worker selects it and shows its info panel', async () => {
  const window = await app.firstWindow();
  const count = window.locator('[title="Workers hired"]');

  await setCollapsed(false);
  const hire = window.getByRole('button', { name: /^Hire/ });
  await expect(hire).toBeVisible();
  await hire.click();
  await expect(count).toHaveText('1 worker');

  // The worker spawns at the plot centre, which the camera frames at the
  // viewport centre; it tills that tile for ~1.5s, so it is there to be clicked.
  const size = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Let the world view finish mounting before clicking into it.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(size.w / 2, size.h / 2);

  const info = window.locator('[data-testid="worker-info"]');
  await expect(info).toBeVisible();
  await expect(info).toContainText('Worker 1');

  await window.screenshot({ path: 'test-results/worker-selected.png' });

  // Esc clears the selection and hides the panel.
  await window.keyboard.press('Escape');
  await expect(info).toBeHidden();
});
