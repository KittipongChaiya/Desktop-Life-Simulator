/**
 * Land expansion. Phase-06d, GAME_DESIGN.md §6.3.
 *
 * `expandLand` is the escalating sink that competes with workers for the same
 * coins (§6.3 — "land raises the ceiling; workers raise throughput toward
 * it"). Each purchase grows the owned plot by one ring; cost follows
 * `floor(100 × 1.8^n)` exactly (crit 13); new tiles are owned and tillable
 * (crit 14).
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../shared/errors';
import { toIndexUnchecked } from '../../shared/geometry';
import { stepSimulation } from '../tick';
import { expansionCost, plotSizeAfter } from '../world/economy';
import { isOwned } from '../world/tile-grid';
import { addCoins } from '../world/wallet';
import { createWorld, type World } from '../world/world';

import { tillTile } from './crop-commands';
import { CommandSource } from './types';

function ownedCount(world: World): number {
  let count = 0;
  for (let tile = 0; tile < 64 * 64; tile += 1) {
    if (isOwned(world.tiles, toIndexUnchecked(tile % 64, Math.floor(tile / 64)))) count += 1;
  }
  return count;
}

function expand(world: World): ReturnType<World['commands']['dispatch']> {
  const result = world.commands.dispatch({ type: 'expandLand' }, { source: CommandSource.Player });
  stepSimulation(world);
  return result;
}

describe('the §6.3 escalation formula (crit 13)', () => {
  it('matches the published table exactly', () => {
    expect(expansionCost(0)).toBe(100); // 1st
    expect(expansionCost(1)).toBe(180); // 2nd
    expect(expansionCost(2)).toBe(324); // 3rd
    expect(expansionCost(3)).toBe(583); // 4th
    expect(expansionCost(4)).toBe(1_049); // 5th
  });

  it('plot size grows by one ring per purchase', () => {
    expect(plotSizeAfter(0)).toBe(8);
    expect(plotSizeAfter(1)).toBe(10);
    expect(plotSizeAfter(5)).toBe(18);
  });
});

describe('expandLand', () => {
  it('spends the cost, grows the plot to 10×10, and counts the purchase (crit 14)', () => {
    const world = createWorld(1); // 100 coins — exactly the first expansion
    expect(ownedCount(world)).toBe(64);

    expect(expand(world).ok).toBe(true);

    expect(world.wallet.coins).toBe(0);
    expect(ownedCount(world)).toBe(100);
    expect(world.economy.expansionsPurchased).toBe(1);
  });

  it('newly owned ring tiles are tillable (crit 14)', () => {
    const world = createWorld(1);
    const ringCorner = toIndexUnchecked(27, 27); // outside 8×8 (28..35), inside 10×10 (27..36)
    expect(tillTile(world, ringCorner).ok).toBe(false); // not owned yet

    expand(world);

    expect(isOwned(world.tiles, ringCorner)).toBe(true);
    expect(tillTile(world, ringCorner).ok).toBe(true);
  });

  it('rejects an unaffordable expansion and changes nothing (crit 7)', () => {
    const world = createWorld(1);
    expand(world); // spends the 100 — broke now
    const result = world.commands.dispatch(
      { type: 'expandLand' },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InsufficientFunds);
    stepSimulation(world);

    expect(ownedCount(world)).toBe(100);
    expect(world.economy.expansionsPurchased).toBe(1);
  });

  it('five expansions cost exactly the table and reach 18×18 (crit 13)', () => {
    const world = createWorld(1);
    addCoins(world.wallet, 2_136); // 2,236 total = 100+180+324+583+1,049
    for (let i = 0; i < 5; i += 1) expect(expand(world).ok).toBe(true);

    expect(world.wallet.coins).toBe(0);
    expect(ownedCount(world)).toBe(324); // 18×18
    expect(world.economy.expansionsPurchased).toBe(5);
  });

  it('stops at the world edge — a plot can never outgrow the map', () => {
    const world = createWorld(1);
    world.economy.expansionsPurchased = 28; // plot would become 66 > 64
    addCoins(world.wallet, Number.MAX_SAFE_INTEGER - 200);

    const result = world.commands.dispatch(
      { type: 'expandLand' },
      { source: CommandSource.Player },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.InvalidIntent);
  });
});
