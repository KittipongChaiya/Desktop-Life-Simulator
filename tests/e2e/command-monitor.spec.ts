/**
 * The command monitor, against the real app. Phase-07.8f.
 *
 * The unit tests prove the ring and the wrapper. What only the real app can
 * prove is that the wrapper is on the path the HUD actually uses — that a
 * click on the world, not just a console call, is observed — and that both
 * outcomes reach it: an accepted command and a refused one.
 *
 * A refusal is easy to arrange honestly here: planting with no seeds in the
 * inventory fails validation at dispatch, which IS the validation result §5
 * asks the monitor to show.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen, waitForDevTools } from './framing';
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

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
  await setCollapsed(false);
});

test.afterEach(async () => {
  await session.dispose();
});

test('a command from the HUD is observed, accepted', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  await window.keyboard.press('1');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 300));

  await window.keyboard.press('F5');
  const monitor = window.getByTestId('command-monitor');
  await expect(monitor).toBeVisible();

  const row = monitor.getByTestId('command-row').filter({ hasText: 'tillTile' });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText('accepted');
  await expect(row.first()).toContainText('player');
});

test('a refused command is observed with the validation error that refused it', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  // Seeds, with an empty inventory: validation refuses this at dispatch.
  await window.keyboard.press('2');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 300));

  await window.keyboard.press('F5');
  const monitor = window.getByTestId('command-monitor');
  const row = monitor.getByTestId('command-row').filter({ hasText: 'plantCrop' });

  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText('rejected');
  // The reason, not merely the fact. A monitor that said "rejected" and stopped
  // would leave the developer exactly where they started.
  await expect(row.first()).toContainText('_');
});
