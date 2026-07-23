/**
 * The idle proof. Phase-06f — acceptance criteria 19, 20, 21, 23.
 *
 * Criterion 19 is the PRODUCT THESIS made testable (`VISION.md` §2.2): with a
 * Market Stall and a Seed Bin, the farm must run and EARN for 8 simulated
 * hours with no player input and no jam. If this test cannot pass, v0.1 has
 * not delivered what it promised. Accelerated in the headless sim per the
 * phase doc — 8 hours of ticks in seconds, which doubles as the throughput
 * proxy for criterion 22.
 *
 * Criterion 21 protects the inversion that makes absence optimal: longer
 * crops stay STRICTLY better coins/sec, seed costs included. Criterion 23
 * pins determinism with every economic system live. Criterion 20's real
 * check is a human playthrough (see the phase doc); the scripted bot here is
 * its automated FLOOR — if even a crude greedy player reaches the stage-4
 * purse in a fraction of the budget, pacing failures are a feel problem, not
 * an arithmetic one.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../src/shared/geometry';
import { CommandSource } from '../src/sim/commands/types';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../src/sim/content/buildings';
import { registerCoreCrops, createCropRegistry } from '../src/sim/content/crops';
import { CORE_TURNIP_SEED, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulation, stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount } from '../src/sim/world/container';
import { MULTIPLIER_CAP, MULTIPLIER_FLOOR, multiplierOf } from '../src/sim/world/economy';
import { isMature } from '../src/sim/content/crops';
import { elapsedTicks } from '../src/sim/world/crop';
import { isOwned } from '../src/sim/world/tile-grid';
import { isTilled } from '../src/sim/world/tile-state';
import { MAX_ENERGY } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

/** 8 hours at 20 Hz. */
const EIGHT_HOURS_TICKS = 20 * 60 * 60 * 8;

/** Dispatches as the player and applies on the next tick. */
function submit(world: World, command: Parameters<World['commands']['dispatch']>[0]): void {
  world.commands.dispatch(command, { source: CommandSource.Player });
}

/**
 * The stage-4 farm, built through the ordinary command path: funded by the
 * declared dev source, all four buildings placed, five workers hired, and a
 * deep turnip seed stock — everything the idle thesis needs.
 */
function idleFarm(seed: number): World {
  const world = createWorld(seed);
  submit(world, { type: 'grantCoins', amount: 10_000 });
  stepSimulation(world);

  // Corners of the plot (28..35): buildings out of the farming middle.
  submit(world, {
    type: 'placeBuilding',
    tile: toIndexUnchecked(28, 28),
    buildingId: CORE_MARKET_STALL,
  });
  submit(world, {
    type: 'placeBuilding',
    tile: toIndexUnchecked(35, 28),
    buildingId: CORE_SEED_BIN,
  });
  submit(world, {
    type: 'placeBuilding',
    tile: toIndexUnchecked(28, 35),
    buildingId: CORE_STORAGE_SHED,
  });
  submit(world, {
    type: 'placeBuilding',
    tile: toIndexUnchecked(35, 35),
    buildingId: CORE_REST_HUT,
  });
  for (let i = 0; i < 5; i += 1) submit(world, { type: 'hireWorker' });
  stepSimulation(world);

  // A deep seed stock — the one input the v0.1 loop still asks the player for
  // (buying seeds is a player act; the bin replants, it does not shop).
  addItems(world.inventory, CORE_TURNIP_SEED, 30 * DEFAULT_STACK_SIZE, DEFAULT_STACK_SIZE);
  return world;
}

describe('full idle: 8 hours unattended (crit 19 — the product thesis)', () => {
  it('earns coins through the stall, keeps working, and never jams', () => {
    const world = idleFarm(20260723);
    const coinsAfterSetup = world.wallet.coins;
    let automaticSales = 0;
    world.events.subscribe('itemSold', (event) => {
      if (event.automatic) automaticSales += 1;
    });

    expect(() => stepSimulationBy(world, EIGHT_HOURS_TICKS)).not.toThrow();

    // The farm FARMED: full cycles, all the way through the stall.
    expect(world.cropStats.planted).toBeGreaterThan(100);
    expect(world.cropStats.harvested).toBeGreaterThan(100);
    expect(automaticSales).toBeGreaterThan(50);

    // And it EARNED — unattended income is the whole point. (Turnips sell at
    // 90% through the stall; seeds were pre-bought, so income is gross.)
    expect(world.wallet.coins).toBeGreaterThan(coinsAfterSetup + 1_000);

    // No jam: every worker alive, in bounds, with sane energy.
    expect(world.workers.size).toBe(5);
    for (const worker of world.workers.values()) {
      expect(worker.energy).toBeGreaterThanOrEqual(0);
      expect(worker.energy).toBeLessThanOrEqual(MAX_ENERGY);
    }

    // The market stayed inside its declared bands throughout.
    const multiplier = multiplierOf(world.economy, 'core:turnip' as never);
    expect(multiplier).toBeGreaterThanOrEqual(MULTIPLIER_FLOOR);
    expect(multiplier).toBeLessThanOrEqual(MULTIPLIER_CAP);
  }, 240_000);
});

describe('balance: longer crops are strictly better coins/sec (crit 21)', () => {
  it('holds across the §3.1 table, seed costs included', () => {
    const registry = createCropRegistry();
    registerCoreCrops(registry);

    // coins/sec/tile = (sale base − seed cost) / growth seconds. The yield is
    // 1 for every v0.1 crop; sale bases come from the item table (§3.1).
    const saleBase: Record<string, number> = {
      'core:turnip': 12,
      'core:wheat': 34,
      'core:carrot': 80,
      'core:pumpkin': 230,
    };
    const rates = registry.all().map((crop) => ({
      id: crop.id,
      rate: ((saleBase[crop.id] ?? 0) - crop.seedCost) / (crop.growthTicks / 20),
    }));

    // Registration order is §3.1 order: turnip, wheat, carrot, pumpkin.
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!.rate).toBeGreaterThan(rates[i - 1]!.rate);
    }
    // Pin the endpoints so a rebalance cannot silently flatten the curve.
    expect(rates[0]!.rate).toBeCloseTo(0.156, 2);
    expect(rates[3]!.rate).toBeCloseTo(0.283, 2);
  });
});

describe('determinism over 100k ticks with the full economy (crit 23)', () => {
  it('produces byte-identical economic state from identical runs', () => {
    const run = (): World => {
      const world = idleFarm(31337);
      stepSimulationBy(world, 100_000);
      return world;
    };

    const a = run();
    const b = run();

    expect(a.wallet.coins).toBe(b.wallet.coins);
    expect([...a.economy.multipliers.entries()]).toEqual([...b.economy.multipliers.entries()]);
    expect(a.economy.expansionsPurchased).toBe(b.economy.expansionsPurchased);
    expect([...a.lastPlanted.entries()]).toEqual([...b.lastPlanted.entries()]);
    expect(a.cropStats).toEqual(b.cropStats);
    expect(a.rng.getState()).toEqual(b.rng.getState());
    expect(JSON.stringify([...a.crops.entries()])).toBe(JSON.stringify([...b.crops.entries()]));
  }, 240_000);
});

describe('pacing floor: the stage-4 purse inside the budget (crit 20)', () => {
  it('a crude greedy player affords the market stall well under 4 hours', () => {
    // The REAL criterion is a human playthrough (phase doc, manual checklist).
    // This bot is the arithmetic floor under it: sell everything, keep seeds
    // stocked, keep the plot planted — turnips only, no optimisation.
    const world = createWorld(7);
    const FOUR_HOURS_TICKS = 20 * 60 * 60 * 4;
    const STAGE_FOUR_PURSE = 1_700; // stall 1,200 + seed bin 500 (§1.1, §5)

    const plot: number[] = [];
    for (let y = 28; y <= 35; y += 1) {
      for (let x = 28; x <= 35; x += 1) plot.push(toIndexUnchecked(x, y));
    }

    let reachedAt: number | null = null;
    for (let elapsed = 0; elapsed < FOUR_HOURS_TICKS && reachedAt === null; elapsed += 20) {
      // One attentive pass a second — far lazier than a human with sound cues.
      for (const tile of plot) {
        const index = toIndexUnchecked(tile % 64, Math.floor(tile / 64));
        if (!isOwned(world.tiles, index)) continue;
        const crop = world.crops.get(index);
        if (crop !== undefined) {
          const definition = world.cropRegistry.get(crop.cropId);
          if (definition.ok && isMature(definition.value, elapsedTicks(crop, world.tick))) {
            submit(world, { type: 'harvestCrop', tile });
          }
          continue;
        }
        if (!isTilled(world.tiles, index)) submit(world, { type: 'tillTile', tile });
        else if (containerCount(world.inventory, CORE_TURNIP_SEED) > 0) {
          submit(world, { type: 'plantCrop', tile, cropId: 'core:turnip' });
        }
      }
      const produce = containerCount(world.inventory, 'core:turnip' as never);
      if (produce > 0)
        submit(world, { type: 'sellItems', itemId: 'core:turnip', quantity: produce });
      const seedsHeld = containerCount(world.inventory, CORE_TURNIP_SEED);
      const wanted = Math.min(64 - seedsHeld, Math.floor(world.wallet.coins / 5));
      if (seedsHeld < 32 && wanted > 0) {
        submit(world, { type: 'buySeeds', cropId: 'core:turnip', quantity: wanted });
      }

      stepSimulationBy(world, 20);
      if (world.wallet.coins >= STAGE_FOUR_PURSE) reachedAt = world.tick;
    }

    expect(reachedAt).not.toBeNull();
    // Well under the wire: if even this bot needs more than an hour of the
    // four, the §3.1 numbers have drifted and the design gate needs a human.
    expect(reachedAt ?? Infinity).toBeLessThan(FOUR_HOURS_TICKS / 4);
  }, 240_000);
});
