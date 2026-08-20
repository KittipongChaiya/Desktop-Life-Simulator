/**
 * Screenshot mode, against the real app. Phase-07.8l.
 *
 * The unit test proves the rule in isolation. What the real app adds is the
 * thing the mode exists for: that with several panels and an in-world overlay
 * running, ONE keystroke leaves a clean frame — and a second keystroke gives
 * the developer their workspace back rather than making them rebuild it.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { waitForDevTools } from './framing';
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

async function pressScreenshot(): Promise<void> {
  const window = await app.firstWindow();
  await window.keyboard.press('Control+Shift+S');
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

test('one keystroke clears every panel, and the next brings them back', async () => {
  const window = await app.firstWindow();

  // A working arrangement: three panels and the chunk overlay.
  await window.keyboard.press('F3');
  await window.keyboard.press('F5');
  await window.keyboard.press('F6');
  await window.keyboard.press('F8');

  await expect(window.getByTestId('debug-overlay')).toBeVisible();
  await expect(window.getByTestId('command-monitor')).toBeVisible();
  await expect(window.getByTestId('time-controls')).toBeVisible();

  await pressScreenshot();

  await expect(window.getByTestId('debug-overlay')).toBeHidden();
  await expect(window.getByTestId('command-monitor')).toBeHidden();
  await expect(window.getByTestId('time-controls')).toBeHidden();
  // The game itself is untouched: it is what the screenshot is OF.
  await expect(window.locator('[title="Simulation uptime"]')).toBeVisible();

  await pressScreenshot();

  await expect(window.getByTestId('debug-overlay')).toBeVisible();
  await expect(window.getByTestId('command-monitor')).toBeVisible();
  await expect(window.getByTestId('time-controls')).toBeVisible();
});

test('a panel left closed stays closed on the way back', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F3');
  await pressScreenshot();
  await pressScreenshot();

  await expect(window.getByTestId('debug-overlay')).toBeVisible();
  await expect(window.getByTestId('event-monitor')).toBeHidden();
});
