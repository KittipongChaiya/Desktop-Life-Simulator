/**
 * The world inspector, against the real app. Phase-07.8c.
 *
 * The unit tests prove the pieces: `readTileFacts` derives the right facts, and
 * the panel pins and samples. Neither can prove the thing most likely to be
 * wrong — that the provider is actually REGISTERED, that the screen→tile
 * picking is hooked to the live camera, and that the world the composition root
 * hands it is the world on screen. That wiring exists only in the running app,
 * so it is asserted here.
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

/** Runs a devtools console command (F1 toggles; the input autofocuses). */
async function consoleCommand(command: string): Promise<void> {
  const window = await app.firstWindow();
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill(command);
  await input.press('Enter');
  await window.keyboard.press('F1');
  await new Promise((resolve) => setTimeout(resolve, 250));
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

test('F4 describes the tile under the pointer', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F4');
  const inspector = window.getByTestId('inspector');
  await expect(inspector).toBeVisible();

  // Over the middle of the window, which is over the world.
  const size = window.viewportSize() ?? { width: 800, height: 600 };
  await window.mouse.move(size.width / 2, size.height / 2);

  // A real tile, described by the provider registered in the composition root.
  await expect(inspector).toContainText(/Tile \d+,\d+/);
  await expect(inspector).toContainText('Kind');
  await expect(inspector).toContainText('core:grass');
  await expect(inspector).toContainText('Enter cost');
  await expect(inspector).toContainText('Occupants');
});

test('P pins the target, and the pointer can then leave it', async () => {
  const window = await app.firstWindow();
  const size = window.viewportSize() ?? { width: 800, height: 600 };

  await window.keyboard.press('F4');
  const inspector = window.getByTestId('inspector');
  const heading = window.getByTestId('inspector-heading');

  await window.mouse.move(size.width / 2, size.height / 2);
  await expect(inspector).toContainText(/Tile \d+,\d+/);
  const pinnedTile = ((await inspector.textContent()) ?? '').match(/Tile \d+,\d+/)?.[0];
  expect(pinnedTile).toBeDefined();

  await window.keyboard.press('p');
  await expect(heading).toContainText('PINNED');

  // Move well away. The reading must not follow.
  await window.mouse.move(4, 4);
  await expect(inspector).toContainText(pinnedTile ?? '');

  await window.keyboard.press('p');
  await expect(heading).not.toContainText('PINNED');
});

test('a worker under the pointer is described from the simulation (07.8d)', async () => {
  const window = await app.firstWindow();

  await consoleCommand('money 5000');
  const hire = window.getByRole('button', { name: /^Hire/ });
  await expect(hire).toBeVisible();
  await hire.click();
  await expect(window.locator('[title="Workers hired"]')).toHaveText('1 worker');

  // PAUSED, so the worker cannot walk out from under the pointer between the
  // hover and the assertion. A spec that raced it would be flaky, and a flaky
  // overlay test is a real bug (TESTING.md §6.4) — the suite runs no retries.
  await consoleCommand('pause');

  await window.keyboard.press('F4');
  const inspector = window.getByTestId('inspector');
  const centre = await plotCentreOnScreen(window);
  await window.mouse.move(centre.x, centre.y);

  // The worker spawns at the plot centre, which the camera frames in the band
  // below the status bar (07.9).
  await expect(inspector).toContainText('Worker #1');
  await expect(inspector).toContainText('Energy');
  // Carrying is on the WORKER RECORD and on no snapshot — seeing it here is
  // the proof that picking reads the drawn view and the facts read the store.
  await expect(inspector).toContainText('Carrying');
  await expect(inspector).toContainText('/20');
});
