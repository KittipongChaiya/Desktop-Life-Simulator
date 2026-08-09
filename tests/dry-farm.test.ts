/**
 * Phase-12c — the playability floor. ADR-022 §5.
 *
 * > **A dry farm must remain fully playable and fully profitable.** Rain may
 * > accelerate; drought may not stall.
 *
 * This is the acceptance `ROADMAP.md` §8 states as *"a farm that never sees
 * rain completes its loop and earns across a long run"*, and it is checked
 * against a REAL world running real ticks rather than against the growth
 * function — the function being right is necessary and not sufficient.
 *
 * The farm is made dry by installing no rain, which is a content-level
 * intervention rather than a flag: a world whose sources register no rainy
 * weather is exactly the world a player with no weather mod would have if core
 * shipped none, so this tests the shipped code path.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../src/shared/geometry';
import { CORE_TURNIP } from '../src/sim/content/crops';
import { DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { harvestCrop, plantCrop, tillTile } from '../src/sim/commands/crop-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { stepSimulationBy } from '../src/sim/tick';
import { growthProgress } from '../src/sim/time/growth';
import { rainfallOver } from '../src/sim/time/wetness';
import { addItems, containerCount } from '../src/sim/world/container';
import { addCoins } from '../src/sim/world/wallet';
import { createWorld, type World } from '../src/sim/world/world';

import type { TileIndex } from '../src/shared/ids';

const TILE: TileIndex = toIndexUnchecked(30, 30);

/**
 * A world it genuinely never rains in, built from public world options only.
 *
 * One weather period long enough to span the whole run, on a seed whose single
 * period resolves to clear. The first attempt doctored the weather registry and
 * handed back a spread copy of the world — which silently broke everything:
 * `createWorld` binds its command dispatcher to the object it RETURNS, so
 * commands executed against the original while the test inspected the copy, and
 * the farm looked stalled when it had never been asked to do anything.
 *
 * Dryness is ASSERTED, so this cannot rot into a test that quietly checks a
 * rainy world.
 */
function dryWorld(seed = 6): World {
  const world = createWorld(seed, { ticksPerWeatherPeriod: 100_000_000 });
  expect(
    rainfallOver(world, world.weatherKindRegistry.all(), 0, 1_000_000),
    'the seed picked for this test rains — pick another',
  ).toBe(0);
  return world;
}

function stocked(world: World): World {
  const turnip = world.cropRegistry.get(CORE_TURNIP);
  if (!turnip.ok) throw new Error('setup failed');
  addItems(world.inventory, turnip.value.seedItem, 200, DEFAULT_STACK_SIZE);
  addCoins(world.wallet, 5_000);
  return world;
}

describe('a farm that never sees rain', () => {
  it('grows a crop in exactly its declared time', () => {
    // `GAME_DESIGN.md` §3.1 says a turnip takes 1,800 ticks. In a dry world
    // that is the whole truth, which is what makes the table still correct
    // after this phase.
    const world = stocked(dryWorld());
    const turnip = world.cropRegistry.get(CORE_TURNIP);
    if (!turnip.ok) throw new Error('setup failed');

    tillTile(world, TILE);
    expect(plantCrop(world, TILE, CORE_TURNIP).ok).toBe(true);

    const crop = world.crops.get(TILE);
    if (crop === undefined) throw new Error('setup failed');

    stepSimulationBy(world, turnip.value.growthTicks);
    expect(growthProgress(world, crop, world.tick)).toBe(turnip.value.growthTicks);
    expect(harvestCrop(world, TILE).ok).toBe(true);
  });

  it('completes the loop unattended and earns, over a long run', () => {
    // A worker, a row of tilled ground, and 40,000 ticks — a bit over half an
    // hour of real time. The assertion is that a dry world still produces,
    // because a drought that stalls a farm is the failure ADR-022 §5 exists to
    // prevent.
    const world = stocked(dryWorld(11));
    expect(hireWorker(world).ok).toBe(true);
    for (let x = 28; x < 34; x += 1) tillTile(world, toIndexUnchecked(x, 30));

    stepSimulationBy(world, 40_000);

    expect(world.cropStats.planted).toBeGreaterThan(0);
    expect(world.cropStats.harvested).toBeGreaterThan(0);
    expect(containerCount(world.inventory, CORE_TURNIP)).toBeGreaterThan(0);
  });

  it('is not outperformed by a rainy world in kind, only in degree', () => {
    // The two worlds run the same seed and the same actions. The rainy one may
    // be ahead; the dry one must not be stalled — the difference is a rate,
    // never a gate.
    const dry = stocked(dryWorld(24));
    const wet = stocked(createWorld(24));

    for (const world of [dry, wet]) {
      expect(hireWorker(world).ok).toBe(true);
      for (let x = 28; x < 33; x += 1) tillTile(world, toIndexUnchecked(x, 30));
      stepSimulationBy(world, 30_000);
    }

    expect(dry.cropStats.harvested).toBeGreaterThan(0);
    expect(wet.cropStats.harvested).toBeGreaterThanOrEqual(dry.cropStats.harvested);
  });
});
