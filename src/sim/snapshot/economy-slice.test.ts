/**
 * The wallet and economy slices. Phase-06d, ADR-005 §2.
 *
 * The wallet slice republishes only when coins change (the coin readout must
 * re-render alone). The economy slice carries INTEGER prices, not raw
 * multipliers — the crit-16 trap: multipliers move every 20 ticks through a
 * recovery, and a slice keyed on them would republish forty times while the
 * visible price changes perhaps seven. Views can only show whole coins, so
 * the slice only speaks in whole coins.
 */

import { describe, expect, it } from 'vitest';

import { CommandSource } from '../commands/types';
import { CORE_WHEAT, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation, stepSimulationBy } from '../tick';
import { addItems } from '../world/container';
import { demandMultiplier, expansionCost } from '../world/economy';
import { createWorld, type World } from '../world/world';

/**
 * A world whose day-0 wheat demand is exactly 1.0 — FOUND, not hardcoded
 * (phase-21, the criterion-9 doctrine): these tests pin the multiplier and
 * recovery arithmetic in exact coins, and a live demand would braid its band
 * into every expected value.
 */
function demandNeutralWorld(): World {
  for (let seed = 1; seed <= 5_000; seed += 1) {
    const world = createWorld(seed);
    if (demandMultiplier(world, CORE_WHEAT) === 1) return world;
  }
  throw new Error('no demand-neutral seed in 5,000');
}

describe('the wallet slice', () => {
  it('projects the balance and republishes only when it changes', () => {
    const world = createWorld(1);
    stepSimulation(world);
    expect(world.snapshots.wallet.value.coins).toBe(100);
    const version = world.snapshots.wallet.version;

    stepSimulationBy(world, 10); // nothing economic happens
    expect(world.snapshots.wallet.version).toBe(version);

    world.commands.dispatch(
      { type: 'grantCoins', amount: 50 },
      { source: CommandSource.Automation },
    );
    stepSimulation(world);
    expect(world.snapshots.wallet.value.coins).toBe(150);
    expect(world.snapshots.wallet.version).toBe(version + 1);
  });
});

describe('the economy slice', () => {
  it('lists every item at its live integer price, sorted by id', () => {
    const world = demandNeutralWorld();
    stepSimulation(world);

    const prices = world.snapshots.economy.value.prices;
    // Four produce, four seeds, and the two processed goods phase-25 added.
    expect(prices.length).toBe(10);
    expect([...prices].map((p) => p.item)).toEqual([...prices].map((p) => p.item).sort());

    const wheat = prices.find((p) => p.item === 'core:wheat');
    expect(wheat).toEqual({ item: 'core:wheat', price: 34, basePrice: 34, demand: 'steady' });
  });

  it('reflects a depressed price after a sale', () => {
    const world = demandNeutralWorld();
    addItems(world.inventory, CORE_WHEAT, 100, DEFAULT_STACK_SIZE);
    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    stepSimulation(world);

    const wheat = world.snapshots.economy.value.prices.find((p) => p.item === 'core:wheat');
    expect(wheat?.price).toBe(27); // floor(34 × 0.8)
    expect(wheat?.basePrice).toBe(34);
  });

  it('carries the expansion counter and the next §6.3 cost', () => {
    const world = createWorld(1);
    stepSimulation(world);
    expect(world.snapshots.economy.value.expansionsPurchased).toBe(0);
    expect(world.snapshots.economy.value.nextExpansionCost).toBe(expansionCost(0));

    world.commands.dispatch({ type: 'expandLand' }, { source: CommandSource.Player });
    stepSimulation(world);
    expect(world.snapshots.economy.value.expansionsPurchased).toBe(1);
    expect(world.snapshots.economy.value.nextExpansionCost).toBe(expansionCost(1));
  });

  it('does not republish every recovery period — only when a price changes (crit 16)', () => {
    const world = demandNeutralWorld();
    addItems(world.inventory, CORE_WHEAT, 100, DEFAULT_STACK_SIZE);
    world.commands.dispatch(
      { type: 'sellItems', itemId: 'core:wheat', quantity: 100 },
      { source: CommandSource.Player },
    );
    stepSimulation(world); // wheat at 0.80 — price 27

    const before = world.snapshots.economy.version;
    // The full recovery: 40 periods over 800 ticks, multiplier moving every
    // 20 ticks. The INTEGER price 27 → 34 passes through at most 8 distinct
    // values, so at most 8 republishes are legitimate.
    stepSimulationBy(world, 800);
    const republishes = world.snapshots.economy.version - before;

    expect(world.snapshots.economy.value.prices.find((p) => p.item === 'core:wheat')?.price).toBe(
      34,
    );
    expect(republishes).toBeGreaterThan(0); // the price did visibly recover
    expect(republishes).toBeLessThanOrEqual(8); // …but never per-period, let alone per-tick
  });

  it('a static economy republishes nothing over hundreds of ticks (crit 17-style)', () => {
    const world = createWorld(1);
    stepSimulation(world);
    const version = world.snapshots.economy.version;
    stepSimulationBy(world, 400);
    expect(world.snapshots.economy.version).toBe(version);
  });
});
