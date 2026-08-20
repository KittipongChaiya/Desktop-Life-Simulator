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

import { createInstalledRegistries } from '../src/sim/content/installed';
import { toIndexUnchecked } from '../src/shared/geometry';
import { asTileIndex } from '../src/shared/ids';
import { CommandSource } from '../src/sim/commands/types';
import {
  CORE_MARKET_STALL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../src/sim/content/buildings';
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
import { longRunBudget } from './long-run-budget';

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
  //
  // Origins are FOOTPRINT-AWARE since phase-41 (ADR-042 §3). A footprint grows
  // up and right from its origin, so the top and right corners no longer work:
  // the 3x2 stall at (28,28) reached into row 27 and the 2x2 hut at (35,35)
  // into column 36, and both were silently refused — which showed up as an
  // eight-hour idle run that earned nothing, not as a placement error.
  submit(world, {
    type: 'placeBuilding',
    tile: toIndexUnchecked(28, 30),
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
    tile: toIndexUnchecked(34, 35),
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
  it(
    'earns coins through the stall, keeps working, and never jams',
    () => {
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
      // 240 s covers the uninstrumented run with room to spare, but V8 coverage
      // instrumentation costs roughly 3.5× on 576,000 ticks — which is how this
      // gate failed only under `--coverage`, silently, until phase-07e ran the
      // full v0.1 release-gate checklist. The budget is the runner's, not the
      // game's: `PERFORMANCE.md` §10.1 measures the simulation uninstrumented.
      //
      // Raised 900 s → 1,800 s at the v0.3 RC: the same 576,000 ticks now step
      // contracts, quests, demand, and the town, and the instrumented run
      // crossed 911 s on the reference machine — a runner allowance again,
      // not a simulation budget (the uninstrumented run passes in minutes).
    },
    longRunBudget(1_200_000),
  );
});

describe('balance: longer crops are strictly better coins/sec (crit 21)', () => {
  it('keeps the v0.1 curve exactly where §3.2 says it is', () => {
    // ## What this test is, after phase 55
    //
    // It used to do two jobs with a hardcoded price table of four crops: check
    // that rates rise across the whole registry in registration order, and pin
    // the endpoints. v0.6 registered eight more crops, and both halves broke —
    // the price table returned `undefined` for every new crop (giving negative
    // rates), and registration order stopped being rate order the moment a
    // 60-second pea was appended after a 1,200-second pumpkin.
    //
    // **The ordering half moved to `tests/crop-curve.test.ts`**, where it is
    // asserted properly: against the live item registry, across all twelve
    // crops, on rate rather than on the order they happen to be registered in.
    // That is strictly stronger than what was here.
    //
    // What is left is the half that only this test can do: **the v0.1 curve is
    // a historical anchor**, and §3.2's prose quotes its numbers. "A player
    // checking in every minute or so is best served by turnips and earns 0.078
    // per tile per second... a player who plants pumpkins earns 0.142 — nearly
    // twice as much for a fraction of the attention." If those three numbers
    // drift, that paragraph becomes false and nothing else would notice.
    //
    // Pinned BY ID rather than by index, because index 0 and index 3 meaning
    // turnip and pumpkin is exactly the kind of coincidence that broke the
    // other half.
    const registry = createInstalledRegistries();
    const rateOf = (cropId: string): number => {
      const crop = registry.crops.get(cropId as never);
      expect(crop.ok, `${cropId} is not registered`).toBe(true);
      if (!crop.ok) return 0;
      const item = registry.items.get(crop.value.harvestYield[0]?.item ?? ('' as never));
      expect(item.ok, `${cropId} yields an unregistered item`).toBe(true);
      const sale = item.ok ? item.value.basePrice : 0;
      return (sale - crop.value.seedCost) / (crop.value.growthTicks / 20);
    };

    const turnip = rateOf('core:turnip');
    const pumpkin = rateOf('core:pumpkin');

    // Halved in 07.9 with the uniform doubling of every growth time (§3.1):
    // the same curve, walked at half speed — the RATIO between the ends, which
    // is what §3.2 actually rests on, is unchanged at 1.82×.
    expect(turnip).toBeCloseTo(0.078, 3);
    expect(pumpkin).toBeCloseTo(0.142, 3);
    expect(pumpkin / turnip).toBeCloseTo(1.82, 2);
  });
});

describe('determinism over 100k ticks with the full economy (crit 23)', () => {
  it(
    'produces byte-identical economic state from identical runs',
    () => {
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
    },
    longRunBudget(240_000),
  );
});

describe('pacing floor: the stage-4 purse inside the budget (crit 20)', () => {
  it(
    'a crude greedy player affords the market stall well under 4 hours',
    () => {
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
          // `tile` IS the flat index — decomposing it with a hardcoded width was
          // a no-op at 64 and a shear at any other (ADR-030 widened the grid).
          const index = asTileIndex(tile);
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
    },
    longRunBudget(240_000),
  );
});
