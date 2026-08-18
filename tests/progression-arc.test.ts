/**
 * How long the game actually takes to play. Phase-31 — ADR-040 §4, `GAME_DESIGN.md` §1.1.
 *
 * v0.1 wrote down a four-stage arc and a criterion — *"reaching stage 4 takes
 * under ~4 hours of play"* — and four versions shipped without anyone measuring
 * it. This is that measurement, and it is deliberately the **machine-verifiable
 * half** of a criterion ADR-040 §4 classifies as AI-observable.
 *
 * ## What this measures, and what it does not
 *
 * A **BOUND**, not a playthrough. The model below plays greedily and perfectly:
 * it never mis-clicks, never walks anywhere, never hesitates, harvests on the
 * exact tick a crop matures, and always knows which crop is worth planting. No
 * human plays like that, so:
 *
 * - a bound ABOVE four hours **fails the criterion outright** — if a perfect
 *   player cannot get there in time, nobody can;
 * - a bound BELOW four hours proves only that the ceiling is REACHABLE, which
 *   is why the criterion itself stays AI-observable and is closed by driving
 *   the real app rather than by this number.
 *
 * ## Why the arithmetic cannot answer it
 *
 * On paper a 64-tile plot of pumpkins clears 2,050 coins in minutes. It does
 * not, because the sale multiplier decays with volume (ADR-013) and recovers on
 * a period — so the real limit is how fast the market absorbs goods, not how
 * fast they grow. That is a feedback loop between two systems, and the only
 * honest way to size it is to run it.
 */

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { toIndexUnchecked } from '../src/shared/geometry';
import type { TileIndex } from '../src/shared/ids';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { buySeeds, sellItems } from '../src/sim/commands/commerce-commands';
import { harvestCrop, plantCrop, tillTile } from '../src/sim/commands/crop-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import {
  CORE_MARKET_STALL,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
  CORE_BUILDINGS,
} from '../src/sim/content/buildings';
import { isMature } from '../src/sim/content/crops';
import { hireCost } from '../src/sim/commands/worker-commands';
import { stepSimulationBy } from '../src/sim/tick';
import { growthProgress } from '../src/sim/time/growth';
import { containerCount } from '../src/sim/world/container';
import { isOwned } from '../src/sim/world/tile-grid';
import { createWorld, type World } from '../src/sim/world/world';

/** Ticks in four hours of real time, at 20 Hz. The criterion's ceiling. */
const FOUR_HOURS_TICKS = 4 * 3600 * 20;

/** How often the model acts. A player does not issue 20 commands a second. */
const ACT_EVERY = 20;

const costOf = (id: (typeof CORE_BUILDINGS)[number]['id']): number =>
  CORE_BUILDINGS.find((building) => building.id === id)?.cost ?? 0;

/** Every owned tile, once. The player's whole plot. */
function ownedTiles(world: World): readonly TileIndex[] {
  const tiles: TileIndex[] = [];
  for (let y = 0; y < world.tiles.height; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const tile = toIndexUnchecked(x, y);
      if (isOwned(world.tiles, tile)) tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * The result of one modelled playthrough.
 *
 * `stallAtTick` is null when the arc was never completed inside the budget,
 * which is a FAIL rather than a missing number — and is reported as one.
 */
interface ArcRun {
  readonly stallAtTick: number | null;
  readonly hiredAtTick: number | null;
  readonly shedAtTick: number | null;
  readonly binAtTick: number | null;
  readonly peakCoins: number;
  readonly ticksRun: number;
}

/**
 * Plays the arc greedily and reports when each stage landed.
 *
 * The policy, in priority order, is what a well-informed player does: harvest
 * anything ripe, sell everything held, buy the next stage as soon as it is
 * affordable, keep every owned tile tilled and planted.
 */
function playTheArc(seed: number, cropId: Parameters<typeof plantCrop>[2]): ArcRun {
  const world = createWorld(seed);
  const seedItem = `${String(cropId)}_seed` as Parameters<typeof buySeeds>[1];

  let hiredAtTick: number | null = null;
  let shedAtTick: number | null = null;
  let binAtTick: number | null = null;
  let stallAtTick: number | null = null;
  let peakCoins = world.wallet.coins;

  // A spot for each building, off the crop rows so nothing competes for tiles.
  const spots = [toIndexUnchecked(28, 28), toIndexUnchecked(29, 28), toIndexUnchecked(30, 28)];

  for (let elapsed = 0; elapsed < FOUR_HOURS_TICKS && stallAtTick === null; elapsed += ACT_EVERY) {
    stepSimulationBy(world, ACT_EVERY);
    peakCoins = Math.max(peakCoins, world.wallet.coins);

    // 1. HARVEST everything ripe. Value that exists is worth more realised.
    for (const crop of [...world.crops.values()]) {
      const definition = world.cropRegistry.get(crop.cropId);
      if (!definition.ok) continue;
      if (isMature(definition.value, growthProgress(world, crop, world.tick))) {
        harvestCrop(world, crop.tile);
      }
    }

    // 2. SELL everything held. The decay is the brake this measurement exists
    //    to feel, so the model does not try to time the market — a player who
    //    waited for recovery would be slower, not faster.
    for (const stack of [...world.inventory.stacks]) {
      if (stack.item === seedItem) continue;
      sellItems(world, stack.item, stack.quantity);
    }

    // 3. BUY the next stage the moment it is affordable, in arc order.
    if (hiredAtTick === null && world.wallet.coins >= hireCost(world.workers.size)) {
      if (hireWorker(world, toIndexUnchecked(35, 35)).ok) hiredAtTick = world.tick;
    }
    if (shedAtTick === null && world.wallet.coins >= costOf(CORE_STORAGE_SHED)) {
      if (placeBuilding(world, spots[0]!, CORE_STORAGE_SHED).ok) shedAtTick = world.tick;
    }
    if (binAtTick === null && world.wallet.coins >= costOf(CORE_SEED_BIN)) {
      if (placeBuilding(world, spots[1]!, CORE_SEED_BIN).ok) binAtTick = world.tick;
    }
    if (world.wallet.coins >= costOf(CORE_MARKET_STALL)) {
      if (placeBuilding(world, spots[2]!, CORE_MARKET_STALL).ok) stallAtTick = world.tick;
    }

    // 4. KEEP THE PLOT WORKING: buy seed, till bare ground, plant tilled ground.
    const tiles = ownedTiles(world);
    const bare = tiles.filter((tile) => world.tiles.tilledAt[tile] === 0);
    const empty = tiles.filter(
      (tile) => world.tiles.tilledAt[tile] !== 0 && !world.crops.has(tile),
    );
    const held = containerCount(world.inventory, seedItem);
    if (held < empty.length) {
      // AS MANY AS THE PURSE ALLOWS, not as many as the plot wants. `buySeeds`
      // is all-or-nothing, so asking for 64 with 100 coins buys ZERO — the
      // first version of this model did exactly that and reported a farm that
      // never planted a seed and never earned a coin. A real player buys what
      // they can afford, and the model has to as well or it measures nothing.
      const price = world.itemRegistry.get(seedItem);
      const each = price.ok ? price.value.basePrice : Number.POSITIVE_INFINITY;
      const affordable = Math.floor(world.wallet.coins / Math.max(1, each));
      const wanted = Math.min(empty.length - held, affordable);
      if (wanted > 0) buySeeds(world, cropId, wanted);
    }

    for (const tile of bare) tillTile(world, tile);
    for (const tile of empty) plantCrop(world, tile, cropId);
  }

  return {
    stallAtTick,
    hiredAtTick,
    shedAtTick,
    binAtTick,
    peakCoins,
    ticksRun: world.tick,
  };
}

/** Ticks as a human duration. A tick count means nothing to a reader. */
const readable = (ticks: number): string => {
  const minutes = Math.round(ticks / 20 / 60);
  return minutes < 60 ? `${String(minutes)}m` : `${(minutes / 60).toFixed(1)}h`;
};

describe('the four-stage arc, timed', () => {
  it('reaches stage 4 inside the four-hour ceiling', () => {
    // THE CRITERION'S BOUND. A perfect player is the fastest anyone can be, so
    // this failing means the criterion cannot be met by anybody.
    const run = playTheArc(4242, 'core:turnip' as Parameters<typeof plantCrop>[2]);

    globalThis.console.log(
      `[arc] turnip · hire ${run.hiredAtTick === null ? 'never' : readable(run.hiredAtTick)}` +
        ` · shed ${run.shedAtTick === null ? 'never' : readable(run.shedAtTick)}` +
        ` · bin ${run.binAtTick === null ? 'never' : readable(run.binAtTick)}` +
        ` · STALL ${run.stallAtTick === null ? 'NEVER' : readable(run.stallAtTick)}` +
        ` · peak ${String(run.peakCoins)}g over ${readable(run.ticksRun)}`,
    );

    expect(
      run.stallAtTick,
      `stage 4 was not reached in four hours; peak was ${String(run.peakCoins)} coins`,
    ).not.toBeNull();
    expect(run.stallAtTick ?? Number.POSITIVE_INFINITY).toBeLessThan(FOUR_HOURS_TICKS);
  }, 900_000);

  it('reaches stage 2 — the emotional core — inside the first half hour', () => {
    // `GAME_DESIGN.md` §1.1 puts the first hire at 10–30 minutes, and
    // `VISION.md` §6.3 calls it the emotional core. A perfect player arriving
    // late here means a real one never gets there.
    const run = playTheArc(4242, 'core:turnip' as Parameters<typeof plantCrop>[2]);

    expect(run.hiredAtTick).not.toBeNull();
    expect(run.hiredAtTick ?? Number.POSITIVE_INFINITY).toBeLessThan(30 * 60 * 20);
  }, 900_000);
});
