/** TEMPORARY: plants a save stocked for day 0's first offer, accepts and
 * delivers it live, and screenshots the board. Deleted after use. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '@playwright/test';

import { serializeSave, toSaveDocument } from '../../src/persistence/serialize';
import { asContentId } from '../../src/shared/ids';
import { stepSimulation } from '../../src/sim/tick';
import { offersForDay } from '../../src/sim/town/offers';
import { addItems } from '../../src/sim/world/container';
import { createWorld } from '../../src/sim/world/world';
import '../../plugins/core';

import { launchIsolated } from './isolated-profile';

test('accept and deliver a contract live', async () => {
  test.setTimeout(180_000);

  const world = createWorld(11);
  stepSimulation(world);
  const offer = offersForDay(world, 0)[0];
  if (offer === undefined) throw new Error('no offer');
  addItems(world.inventory, asContentId(offer.item), offer.quantity, 999);

  const session = await launchIsolated({}, (userData) => {
    mkdirSync(join(userData, 'saves'), { recursive: true });
    writeFileSync(
      join(userData, 'saves', 'slot-0.json'),
      serializeSave(
        toSaveDocument(world, {
          gameVersion: '0.3.0-dev',
          createdAtUnixMs: 1_753_000_000_000,
          savedAtUnixMs: Date.now(),
          playtimeTicks: world.tick,
          saveCount: 1,
        }),
      ),
      'utf8',
    );
  });

  const window = await session.app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(false);
  });
  await new Promise((resolve) => setTimeout(resolve, 4000));

  await window.getByRole('button', { name: /^Board/ }).click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await window.screenshot({ path: 'test-results/board-offers.png' });

  await window
    .getByRole('button', { name: /^Accept/ })
    .first()
    .click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  await window.screenshot({ path: 'test-results/board-accepted.png' });

  await window.getByRole('button', { name: /^Deliver/ }).click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  await window.screenshot({ path: 'test-results/board-delivered.png' });

  await session.dispose();
});
