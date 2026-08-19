/**
 * Painting a worker's zone, end to end. Phase-48 — ADR-024 §2, §4.
 *
 * `setWorkerZone` has existed and been tested since phase-14c and NOTHING HAS
 * EVER BEEN ABLE TO CALL IT. `WorkerRoles.tsx` recorded why in its own header:
 * a zone is a set of tiles, so choosing one is a map interaction rather than a
 * dropdown, and the panel shipped roles alone rather than a text box of tile
 * indices that would look like the feature and be unusable.
 *
 * So the thing worth proving is not that the command works — unit tests cover
 * that — but that a PLAYER can now reach it: arm from the panel, drag on the
 * farm, and have the zone land in the simulation.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen, shoot } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
test('a zone can be painted onto the farm at all', async ({}, testInfo) => {
  const window = await app.firstWindow();

  // A worker to zone. Hiring costs 150 and the farm starts with 100, so the
  // suite funds itself the way a developer would (the devtools `money`
  // command, 06c) rather than simulating an hour of turnips.
  await window.keyboard.press('F1');
  const console_ = window.getByLabel('Developer console input');
  await console_.fill('money 5000');
  await console_.press('Enter');
  await window.keyboard.press('F1');
  await window.waitForTimeout(300);

  const hire = window.getByRole('button', { name: /Hire/ });
  await hire.click();
  await window.waitForTimeout(400);

  // The per-worker controls live behind the worker-count toggle, so the panel
  // has to be expanded before the button exists at all.
  await window
    .getByRole('button', { name: /worker/ })
    .first()
    .click();
  await window.waitForTimeout(200);

  // Arm painting from the worker panel — the control that did not exist.
  const arm = window.getByRole('button', { name: /^Set zone for worker/ }).first();
  await expect(arm).toBeVisible();
  await arm.click();
  await expect(arm).toHaveText('Painting…');
  await expect(arm).toHaveAttribute('aria-pressed', 'true');

  // Drag a rectangle over the plot. The press sets one corner and the release
  // sets the other, which is what makes this different from every other
  // pointer action in the game.
  const centre = await plotCentreOnScreen(window);
  await window.mouse.move(centre.x - 60, centre.y - 20);
  await window.mouse.down();
  for (let step = 1; step <= 5; step += 1) {
    await window.mouse.move(centre.x - 60 + step * 24, centre.y - 20 + step * 8);
  }
  await shoot(app, testInfo.outputPath('zone-mid-drag.png'));
  await window.mouse.up();
  await window.waitForTimeout(400);

  await shoot(app, testInfo.outputPath('zone-painted.png'));

  // WAS THE COMMAND EVEN SUBMITTED? The devtools command monitor records
  // every dispatch with its verdict, which separates "the UI never fired" from
  // "the simulation refused" — two failures that look identical from outside.
  await window.keyboard.press('F5');
  const monitor = window.getByTestId('command-monitor');
  await expect(monitor).toBeVisible();
  const row = monitor.getByTestId('command-row').filter({ hasText: 'setWorkerZone' });
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText('accepted');
  await window.keyboard.press('F5');

  // AND THE ZONE IS NOT EMPTY, which is the half that matters and the half a
  // screenshot cannot show. `setWorkerZone` reads an empty list as "clear the
  // zone" (deliberately — a mis-click must not confine a worker to nowhere),
  // so a drag that painted nothing produces an ACCEPTED command that does
  // nothing at all. The two are indistinguishable without a count.
  //
  // The count comes from the devtools `render.zone` metric, because
  // `workers-slice.ts` deliberately does not project a zone: comparing a tile
  // set per worker per tick to decide whether to republish is the cost
  // ADR-005 §2 exists to prevent.
  await window.keyboard.press('F3');
  const metrics = window.getByText(/tiles$/);
  await expect(metrics.first()).toBeVisible();
  await expect(metrics.first()).not.toContainText('· 0 tiles');
  await window.keyboard.press('F3');

  // Esc leaves the mode, which is the only way out that does not need the
  // panel to still be on screen.
  await window.keyboard.press('Escape');
  await expect(arm).toHaveText('Set zone');
});
