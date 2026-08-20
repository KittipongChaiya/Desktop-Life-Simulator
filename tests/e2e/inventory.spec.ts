/**
 * Inventory panel, end to end. Phase-05d (acceptance criteria 15, 16).
 *
 * Drives the real app: the panel opens from its toggle without stealing focus,
 * and shows the capacity readout and an empty state off the inventory slice.
 * (A populated grid needs a full harvest cycle, which the headless slice tests
 * cover; here we prove the panel renders and reads the slice.)
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { shoot } from './framing';
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

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

test('the inventory panel opens and shows capacity', async () => {
  const window = await app.firstWindow();
  await setCollapsed(false);

  const toggle = window.getByRole('button', { name: /^Inventory/ });
  await expect(toggle).toBeVisible();
  // Base capacity is 40 slots, empty.
  await expect(toggle).toContainText('0/40');

  await toggle.click();
  const panel = window.locator('[data-testid="inventory"]');
  await expect(panel).toContainText('0 / 40 slots');
  await expect(panel).toContainText('Nothing stored yet');

  await shoot(app, 'test-results/inventory-panel.png');

  // Opening the panel must not steal focus from the world (crit 16): the overlay
  // stays non-focusable.
  const focusable = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isFocusable(),
  );
  expect(focusable).toBe(false);
});
