/**
 * Reputation and the notice board, on the real app. Phase-22 — ADR-034.
 *
 * The version's heart, end to end: a crafted save one delivery short of
 * Friend launches, the player accepts and delivers the third contract on
 * screen, and the spec watches everything that must move at that moment —
 * the frozen reward landing, the standing line stepping up, the third
 * slot's lock opening WITHOUT a reload, and the milestone chains paying
 * out through the same wallet the HUD reads.
 *
 * The save is planted through the launcher's `prepare` seam (07e), built by
 * the real serializer from a FOUND seed whose day-0 open slots ask for
 * turnips — the criterion-9 doctrine, because the flow needs goods the
 * player can hold at launch.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type ElectronApplication } from '@playwright/test';

import '../../plugins/core';
import type { SaveMeta } from '../../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../../src/persistence/serialize';
import { asContentId } from '../../src/shared/ids';
import { DEFAULT_STACK_SIZE } from '../../src/sim/content/items';
import { BOARD_SLOTS, offersForDay, type ContractOffer } from '../../src/sim/town/offers';
import { addItems } from '../../src/sim/world/container';
import { FRIEND_AT } from '../../src/sim/world/reputation';
import { STARTING_COINS } from '../../src/sim/world/wallet';
import { createWorld } from '../../src/sim/world/world';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

const TURNIP = asContentId('core:turnip');
/** Town chain step 2 (150g) + the requester's errand step 1 (40g). */
const MILESTONE_COINS = 190;

let session: IsolatedSession;
let app: ElectronApplication;
let offer: ContractOffer;

/**
 * A world one delivery short of Friend, holding exactly the goods a found
 * day-0 open turnip offer asks for. The town chain's first step is marked
 * paid so launch owes nothing — the payouts this spec asserts are the ones
 * the on-screen delivery earns.
 */
function craftSave(userData: string): void {
  let world = null;
  for (let seed = 1; seed <= 5_000 && world === null; seed += 1) {
    const candidate = createWorld(seed);
    const turnipOffer = offersForDay(candidate, 0)
      .filter((candidateOffer) => candidateOffer.offerId % BOARD_SLOTS < 2)
      .find((candidateOffer) => candidateOffer.item === TURNIP);
    if (turnipOffer !== undefined) {
      world = candidate;
      offer = turnipOffer;
    }
  }
  if (world === null) throw new Error('no day-0 open turnip offer in 5,000 seeds');

  addItems(world.inventory, TURNIP, offer.quantity, DEFAULT_STACK_SIZE);
  world.contractStats.fulfilled = FRIEND_AT - 1;
  world.quests.set('core:quest_good_neighbour', 1);

  const meta: SaveMeta = {
    gameVersion: '0.3.0-dev',
    createdAtUnixMs: Date.now() - 60_000,
    savedAtUnixMs: Date.now(),
    playtimeTicks: 0,
    saveCount: 1,
  };
  mkdirSync(join(userData, 'saves'), { recursive: true });
  writeFileSync(join(userData, 'saves', 'slot-0.json'), serializeSave(toSaveDocument(world, meta)));
}

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
  session = await launchIsolated({}, craftSave);
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
});

test.afterEach(async () => {
  await session.dispose();
});

test('the third delivery: the reward lands, standing steps up, the board unlocks, the milestones pay', async (_fixtures, testInfo) => {
  const window = await app.firstWindow();
  await setCollapsed(false);

  const coins = window.locator('[title="Coins"]');
  const readCoins = async (): Promise<number> =>
    Number((await coins.textContent())?.replaceAll(/[^0-9]/g, '') ?? '0');

  await window.getByRole('button', { name: /^Board/ }).click();
  const board = window.getByTestId('board');

  // A newcomer's board: four slots derived, the later two visibly locked.
  await expect(board.getByTestId('standing')).toContainText('Newcomer');
  await expect(board.getByTestId('standing')).toContainText(
    `next at ${String(FRIEND_AT)} delivered`,
  );
  await expect(board.getByText('for friends of the town')).toBeVisible();
  await expect(board.getByText('for pillars of the town')).toBeVisible();
  await window.screenshot({ path: testInfo.outputPath('board-newcomer.png') });

  // The readout TWEENS up from zero on launch — wait for it to settle on the
  // save's exact balance before taking the baseline, or the delta lies.
  await expect.poll(readCoins).toBe(STARTING_COINS);
  const before = await readCoins();

  // Accept the found offer and deliver it — the goods are already held.
  await board
    .getByRole('button', { name: `Accept · ${String(offer.rewardCoins)}g` })
    .first()
    .click();
  const deliver = board.getByRole('button', {
    name: `Deliver · ${String(offer.rewardCoins)}g`,
  });
  await expect(deliver).toBeEnabled();
  await deliver.click();

  // The frozen reward plus both milestone payouts, exactly (ADR-034 §4, §5).
  await expect.poll(readCoins).toBe(before + offer.rewardCoins + MILESTONE_COINS);

  // Standing stepped up live, and the Friend slot's lock opened with it.
  await expect(board.getByTestId('standing')).toContainText('Friend of the town');
  await expect(board.getByText('for friends of the town')).toHaveCount(0);
  await expect(board.getByText('for pillars of the town')).toBeVisible();
  await expect(board.getByText('delivered ✓')).toBeVisible();

  // The town chain moved to its last ask; the requester's errand advanced.
  await expect(board.getByText(/Deliver 10 contracts/)).toBeVisible();
  await window.screenshot({ path: testInfo.outputPath('board-friend.png') });
});
