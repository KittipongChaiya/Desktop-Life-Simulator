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
