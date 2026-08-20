/**
 * The event monitor, against the real app. Phase-07.8e.
 *
 * The unit tests prove the ring bounds itself and the observer only subscribes.
 * What they cannot prove is that the observer is attached to the world's actual
 * bus — that a real player action, travelling the ordinary command path,
 * arrives in the ring.
 *
 * It also asserts the property that made the always-on subscription worth its
 * cost: the ring records while the panel is CLOSED, so opening F2 after
 * something goes wrong shows what led up to it.
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

test('an event from a real player action arrives in the ring', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  // Arm the hoe and till the plot centre. This travels the ordinary path —
  // click → command → dispatcher → tick → tileTilled — with no shortcut.
  await window.keyboard.press('1');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 400));

  // Opened AFTER the fact. The ring was recording the whole time.
  await window.keyboard.press('F2');
  const monitor = window.getByTestId('event-monitor');
  await expect(monitor).toBeVisible();
  await expect(monitor).toContainText('tileTilled');
});

test('the filters hide a type without stopping the recording', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  await window.keyboard.press('1');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 400));

  await window.keyboard.press('F2');
  const monitor = window.getByTestId('event-monitor');
  // Scoped to the tilled rows on purpose: `appStarted` is observed too, so a
  // bare "no rows" assertion would be asserting the wrong thing and would pass
  // or fail for reasons that have nothing to do with the filter.
  const tilled = monitor.getByTestId('event-row').filter({ hasText: 'tileTilled' });
  await expect(tilled.first()).toBeVisible();

  await monitor.getByRole('button', { name: 'tileTilled' }).click();
  await expect(tilled).toHaveCount(0);

  // Filtering is a view concern: the observation is still there, and turning
  // the type back on brings it back rather than having lost it.
  await monitor.getByRole('button', { name: 'tileTilled' }).click();
  await expect(tilled.first()).toBeVisible();
});
