/**
 * Crop command tests. Phase-03.
 *
 * Every event introduced here is exercised for PRODUCER, DELIVERY, CONSUMER
 * EXECUTION, and ORDERING — an event lacking any of the four is incomplete
 * (ADR-008).
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_DAYS_PER_SEASON, DEFAULT_TICKS_PER_DAY } from '../../shared/constants';
import { ErrorCode } from '../../shared/errors';
import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, type ContentId, type TileIndex } from '../../shared/ids';
import { CORE_CARROT, CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT, stageFor } from '../content/crops';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulationBy } from '../tick';
import { addItems, containerCount } from '../world/container';
import { elapsedTicks } from '../world/crop';
import { isTilled, TileState, tileStateAt } from '../world/tile-state';
import { createWorld, type World } from '../world/world';

import { harvestCrop, plantCrop, tillTile } from './crop-commands';

/** Tiles inside and outside the centred 8x8 starting plot. */
const OWNED: TileIndex = toIndexUnchecked(30, 30);
const OUTSIDE: TileIndex = toIndexUnchecked(2, 2);

/**
 * Stocks the farm with seeds of every crop. Planting consumes a seed from the
 * player inventory (phase-06b), so tests about OTHER rules provision freely —
 * the declared test source, like a harvest is in play.
 */
function grantAllSeeds(world: World, quantity = 20): void {
  for (const crop of [CORE_TURNIP, CORE_WHEAT, CORE_CARROT, CORE_PUMPKIN]) {
    const definition = world.cropRegistry.get(crop);
    if (!definition.ok) throw new Error('setup failed');
    addItems(world.inventory, definition.value.seedItem, quantity, DEFAULT_STACK_SIZE);
  }
}

function readyWorld(): World {
  const world = createWorld(1);
  grantAllSeeds(world);
  tillTile(world, OWNED);
  return world;
}

function query(world: World) {
  return {
    grid: world.tiles,
    crops: world.crops,
    cropRegistry: world.cropRegistry,
    tick: world.tick,
  };
}

/**
 * A crop's total growth time, READ FROM ITS DEFINITION.
 *
 * Never a tick literal: durations are balance data (`GAME_DESIGN.md` §3.1) and
 * are expected to move. A test that spells "2400" turns silently into a test of
 * an immature crop the first time wheat is rebalanced — which is exactly what
 * the 07.9 pass found.
 */
function growthTicks(world: World, cropId: ContentId): number {
  const definition = world.cropRegistry.get(cropId);
  if (!definition.ok) throw new Error('setup failed');
  return definition.value.growthTicks;
}

describe('plant validation', () => {
  it('plants on an owned, tilled, empty tile', () => {
    const world = readyWorld();
    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);
    expect(world.crops.size).toBe(1);
  });

  it('rejects an unknown crop', () => {
    const world = readyWorld();
    expect(plantCrop(world, OWNED, asContentId('core:nonexistent')).ok).toBe(false);
    expect(world.crops.size).toBe(0);
  });

  it('rejects a tile outside the owned plot', () => {
    const world = createWorld(1);
    grantAllSeeds(world);
    world.tiles.tilledAt[OUTSIDE] = 1;

    expect(plantCrop(world, OUTSIDE, CORE_WHEAT).ok).toBe(false);
    expect(world.crops.size).toBe(0);
  });

  it('rejects an untilled tile', () => {
    expect(plantCrop(createWorld(1), OWNED, CORE_WHEAT).ok).toBe(false);
  });

  it('rejects an occupied tile without replacing what is there', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);

    expect(plantCrop(world, OWNED, CORE_TURNIP).ok).toBe(false);
    expect(world.crops.get(OWNED)?.cropId).toBe(CORE_WHEAT);
  });

  it('leaves the world untouched when rejected', () => {
    const world = createWorld(1);
    plantCrop(world, OWNED, CORE_WHEAT);

    expect(world.crops.size).toBe(0);
    expect(world.events.pending()).toBe(0);
  });
});

describe('planting consumes a seed (phase-06b, §8.1)', () => {
  it('consumes exactly one seed of the planted crop', () => {
    const world = readyWorld(); // 20 of each seed
    const wheat = world.cropRegistry.get(CORE_WHEAT);
    if (!wheat.ok) throw new Error('setup failed');

    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);
    expect(containerCount(world.inventory, wheat.value.seedItem)).toBe(19);
  });

  it('rejects planting with no matching seed and mutates nothing', () => {
    const world = createWorld(1);
    tillTile(world, OWNED); // tilled, owned, empty — but the farm holds no seeds
    // Drained so the count below measures the PLANT alone; the till legitimately
    // published its own `tileTilled`.
    world.events.flush();

    const result = plantCrop(world, OWNED, CORE_WHEAT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.MissingItem);
    expect(world.crops.size).toBe(0);
    expect(world.events.pending()).toBe(0);
  });

  it('a seed of another crop does not substitute', () => {
    const world = createWorld(1);
    tillTile(world, OWNED);
    const turnip = world.cropRegistry.get(CORE_TURNIP);
    if (!turnip.ok) throw new Error('setup failed');
    addItems(world.inventory, turnip.value.seedItem, 5, DEFAULT_STACK_SIZE);

    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(false);
    expect(plantCrop(world, OWNED, CORE_TURNIP).ok).toBe(true);
  });

  it("records the tile's last planted crop — the seed bin's memory (06c)", () => {
    const world = readyWorld();
    expect(world.lastPlanted.get(OWNED)).toBeUndefined();

    plantCrop(world, OWNED, CORE_WHEAT);
    expect(world.lastPlanted.get(OWNED)).toBe(CORE_WHEAT);

    // The record survives the harvest — that is its entire purpose.
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));
    harvestCrop(world, OWNED);
    expect(world.lastPlanted.get(OWNED)).toBe(CORE_WHEAT);

    // Replanting a different crop overwrites it — after tilling the ground
    // again, which the harvest reverted (07.9).
    tillTile(world, OWNED);
    plantCrop(world, OWNED, CORE_TURNIP);
    expect(world.lastPlanted.get(OWNED)).toBe(CORE_TURNIP);
  });

  it('the last seed plants; the next plant is refused', () => {
    const world = createWorld(1);
    const wheat = world.cropRegistry.get(CORE_WHEAT);
    if (!wheat.ok) throw new Error('setup failed');
    addItems(world.inventory, wheat.value.seedItem, 1, DEFAULT_STACK_SIZE);
    const second = toIndexUnchecked(31, 30);
    tillTile(world, OWNED);
    tillTile(world, second);

    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);
    expect(plantCrop(world, second, CORE_WHEAT).ok).toBe(false);
    expect(world.crops.size).toBe(1);
  });
});

describe('harvest validation', () => {
  it('rejects an empty tile', () => {
    expect(harvestCrop(createWorld(1), OWNED).ok).toBe(false);
  });

  it('rejects an immature crop and leaves it planted', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, 10);

    expect(harvestCrop(world, OWNED).ok).toBe(false);
    expect(world.crops.size).toBe(1);
  });

  it('harvests once mature', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));

    expect(harvestCrop(world, OWNED).ok).toBe(true);
    expect(world.crops.size).toBe(0);
  });

  it('rejects harvesting the same crop twice', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));
    harvestCrop(world, OWNED);

    expect(harvestCrop(world, OWNED).ok).toBe(false);
  });
});

describe('harvest returns the tile to bare ground (07.9)', () => {
  /** A world with one mature wheat crop standing on tilled soil. */
  function harvestReady(): World {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));
    return world;
  }

  it('clears the tilling with the crop', () => {
    const world = harvestReady();
    expect(isTilled(world.tiles, OWNED)).toBe(true);

    expect(harvestCrop(world, OWNED).ok).toBe(true);

    expect(world.crops.has(OWNED)).toBe(false);
    expect(isTilled(world.tiles, OWNED)).toBe(false);
    expect(world.tiles.tilledAt[OWNED]).toBe(0);
  });

  it('publishes tileUntilled, delivered on flush like every other event', () => {
    // The renderer's only notice: `tilledAt` reaches no snapshot slice, so
    // without this the tilled sprite outlives the soil (the same reason
    // `tillTile` publishes `tileTilled`).
    const world = harvestReady();
    const received: number[] = [];
    world.events.subscribe('tileUntilled', (event) => received.push(event.tile));

    harvestCrop(world, OWNED);
    expect(received).toHaveLength(0); // queued, never dispatched inline

    world.events.flush();
    expect(received).toEqual([OWNED]);
  });

  it('publishes it after cropHarvested — the revert is the consequence', () => {
    const world = harvestReady();
    const order: string[] = [];
    world.events.subscribe('cropHarvested', () => order.push('harvested'));
    world.events.subscribe('tileUntilled', () => order.push('untilled'));

    harvestCrop(world, OWNED);
    world.events.flush();

    expect(order).toEqual(['harvested', 'untilled']);
  });

  it('publishes nothing and clears nothing when the harvest is rejected', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    world.events.flush(); // drain the till and the plant

    expect(harvestCrop(world, OWNED).ok).toBe(false); // still growing

    expect(world.events.pending()).toBe(0);
    expect(isTilled(world.tiles, OWNED)).toBe(true);
  });

  it('closes the loop: the tile must be tilled again before it can be replanted', () => {
    // The whole point of the change — seed → tilled → crop → harvest → ground,
    // and round again through the SAME commands a player or worker issues.
    const world = harvestReady();
    harvestCrop(world, OWNED);

    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(false);

    expect(tillTile(world, OWNED).ok).toBe(true);
    expect(plantCrop(world, OWNED, CORE_WHEAT).ok).toBe(true);
  });

  it('leaves the plot around it alone', () => {
    // One harvest reverts ONE tile: a neighbour tilled in the same breath is
    // still tilled afterwards.
    const world = harvestReady();
    const neighbour = toIndexUnchecked(31, 30);
    tillTile(world, neighbour);

    harvestCrop(world, OWNED);

    expect(isTilled(world.tiles, neighbour)).toBe(true);
  });
});

describe('growth progression', () => {
  it('advances through stages monotonically and never regresses', () => {
    const world = readyWorld();
    const definition = world.cropRegistry.get(CORE_WHEAT);
    if (!definition.ok) throw new Error('setup failed');

    const stages: number[] = [];
    for (let elapsed = 0; elapsed <= growthTicks(world, CORE_WHEAT); elapsed += 100) {
      stages.push(stageFor(definition.value, elapsed));
    }

    expect(stages[0]).toBe(0);
    expect(stages.at(-1)).toBe(3);
    for (let i = 1; i < stages.length; i += 1) {
      expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1] ?? 0);
    }
  });

  it('matures exactly at growthTicks, not one tick before', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);

    stepSimulationBy(world, growthTicks(world, CORE_WHEAT) - 1);
    expect(harvestCrop(world, OWNED).ok).toBe(false);

    stepSimulationBy(world, 1);
    expect(harvestCrop(world, OWNED).ok).toBe(true);
  });

  it('grows multiple crops independently', () => {
    const world = createWorld(1);
    grantAllSeeds(world);
    const early = toIndexUnchecked(29, 29);
    const late = toIndexUnchecked(31, 31);
    tillTile(world, early);
    tillTile(world, late);

    const settle = 400;
    plantCrop(world, early, CORE_TURNIP);
    stepSimulationBy(world, growthTicks(world, CORE_TURNIP) - settle);
    plantCrop(world, late, CORE_WHEAT);
    stepSimulationBy(world, settle);

    // The turnip has had its whole growth; the wheat, planted later and slower
    // besides, has had only the tail of it.
    expect(harvestCrop(world, early).ok).toBe(true);
    expect(harvestCrop(world, late).ok).toBe(false);
  });
});

describe('derived tile state (ADR-009 §1)', () => {
  it('reports every state without storing any of them', () => {
    const world = createWorld(1);
    grantAllSeeds(world);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Empty);

    tillTile(world, OWNED);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Tilled);

    plantCrop(world, OWNED, CORE_WHEAT);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Planted);

    const half = growthTicks(world, CORE_WHEAT) / 2;
    stepSimulationBy(world, half);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Growing);

    stepSimulationBy(world, half);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.HarvestReady);

    // And the harvest hands the tile back to bare ground (07.9).
    harvestCrop(world, OWNED);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Empty);
  });
});

describe('events: producer, delivery, consumer, ordering', () => {
  it('produces cropPlanted and delivers it only on flush', () => {
    const world = readyWorld();
    const received: number[] = [];
    world.events.subscribe('cropPlanted', (event) => received.push(event.tile));

    plantCrop(world, OWNED, CORE_WHEAT);
    expect(received).toHaveLength(0); // queued, never dispatched inline

    world.events.flush();
    expect(received).toEqual([OWNED]);
  });

  it('produces tileTilled carrying the recorded tick', () => {
    // The renderer's only notice that a tile changed: `tilledAt` is in no
    // snapshot slice, so without this the tilled soil is never drawn.
    const world = createWorld(1);
    const received: { tile: number; tick: number }[] = [];
    world.events.subscribe('tileTilled', (event) => received.push({ ...event }));

    tillTile(world, OWNED);
    expect(received).toHaveLength(0); // queued, never dispatched inline

    world.events.flush();
    expect(received).toEqual([{ tile: OWNED, tick: world.tiles.tilledAt[OWNED] }]);
  });

  it('publishes no tileTilled for a rejected till', () => {
    const world = createWorld(1);
    tillTile(world, OUTSIDE); // unowned
    tillTile(world, OWNED);
    tillTile(world, OWNED); // already tilled

    expect(world.events.pending()).toBe(1);
  });

  it('produces cropHarvested carrying its yields', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));

    const yields: { item: string; quantity: number }[] = [];
    world.events.subscribe('cropHarvested', (event) => yields.push(...event.yields));

    harvestCrop(world, OWNED);
    world.events.flush();

    expect(yields).toEqual([{ item: 'core:wheat', quantity: 1 }]);
  });

  it('executes the built-in consumer, updating cumulative counters', () => {
    // cropStats is the ADR-008 consumer. Cumulative counts cannot be
    // recomputed from the crop map, so only the event stream maintains them.
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, growthTicks(world, CORE_WHEAT));
    harvestCrop(world, OWNED);
    world.events.flush();

    expect(world.cropStats.planted).toBe(1);
    expect(world.cropStats.harvested).toBe(1);
    expect(world.cropStats.lastActivityTick).toBeGreaterThan(0);
  });

  it('delivers events in publish order', () => {
    const world = createWorld(1);
    grantAllSeeds(world);
    const order: string[] = [];
    world.events.subscribe('cropPlanted', () => order.push('planted'));
    world.events.subscribe('cropHarvested', () => order.push('harvested'));

    tillTile(world, OWNED);
    plantCrop(world, OWNED, CORE_TURNIP);
    stepSimulationBy(world, growthTicks(world, CORE_TURNIP));
    harvestCrop(world, OWNED);
    world.events.flush();

    expect(order).toEqual(['planted', 'harvested']);
  });

  it('publishes nothing when a command is rejected', () => {
    const world = createWorld(1);
    plantCrop(world, OWNED, CORE_WHEAT); // untilled
    harvestCrop(world, OWNED); // empty

    expect(world.events.pending()).toBe(0);
    world.events.flush();
    expect(world.cropStats.planted).toBe(0);
  });

  it('is dispatched by the tick pipeline with no manual flush', () => {
    // eventFlush runs in postUpdate every tick (ADR-007 §4a).
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, 1);

    expect(world.cropStats.planted).toBe(1);
  });
});

describe('determinism and offline progression', () => {
  it('produces identical state from identical command sequences', () => {
    const run = (): World => {
      const world = createWorld(42);
      grantAllSeeds(world);
      tillTile(world, OWNED);
      plantCrop(world, OWNED, CORE_WHEAT);
      stepSimulationBy(world, growthTicks(world, CORE_WHEAT));
      harvestCrop(world, OWNED);
      stepSimulationBy(world, 10);
      return world;
    };

    const a = run();
    const b = run();

    expect(a.tick).toBe(b.tick);
    expect(a.rng.getState()).toEqual(b.rng.getState());
    expect(a.cropStats).toEqual(b.cropStats);
  });

  it('is EXACT across an offline gap, with no catch-up pass (ADR-009 §2)', () => {
    // Growth derives from plantedTick, so advancing the tick reproduces
    // precisely what continuous play would have produced.
    const continuous = readyWorld();
    plantCrop(continuous, OWNED, CORE_WHEAT);
    stepSimulationBy(continuous, growthTicks(continuous, CORE_WHEAT));

    const offline = readyWorld();
    plantCrop(offline, OWNED, CORE_WHEAT);
    offline.tick += growthTicks(offline, CORE_WHEAT); // a gap: no ticks are run at all

    const grown = continuous.crops.get(OWNED);
    const skipped = offline.crops.get(OWNED);
    if (grown === undefined || skipped === undefined) throw new Error('setup failed');

    expect(elapsedTicks(skipped, offline.tick)).toBe(elapsedTicks(grown, continuous.tick));
    expect(harvestCrop(offline, OWNED).ok).toBe(true);
  });

  it('leaves a crop planted before an eight-hour gap ready after it', () => {
    const world = readyWorld();
    // Into autumn before planting: phase-11b made `core:pumpkin` an
    // autumn/winter crop, so a spring planting is now refused. The test is
    // about a gap, not about the calendar — it keeps the longest crop and
    // plants it in its own season.
    world.tick = DEFAULT_TICKS_PER_DAY * DEFAULT_DAYS_PER_SEASON * 2;
    tillTile(world, OWNED);
    expect(plantCrop(world, OWNED, CORE_PUMPKIN).ok).toBe(true);

    world.tick += 20 * 60 * 60 * 8;

    expect(harvestCrop(world, OWNED).ok).toBe(true);
  });
});

describe('serialization stability', () => {
  it('round-trips a crop instance through JSON unchanged', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);

    expect(JSON.parse(JSON.stringify(world.crops.get(OWNED))) as unknown).toEqual({
      cropId: 'core:wheat',
      tile: OWNED,
      plantedTick: world.tick,
    });
  });

  it('stores no derived growth state', () => {
    // ADR-009 §2: an instance carries cropId, tile, plantedTick — nothing else.
    // A stage or progress field would be a second source of truth.
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);

    expect(Object.keys(world.crops.get(OWNED) ?? {}).sort()).toEqual([
      'cropId',
      'plantedTick',
      'tile',
    ]);
  });

  it('reproduces byte-identical crop state from the same seed and commands', () => {
    const snapshot = (world: World): string =>
      JSON.stringify([...world.crops.entries()].sort(([a], [b]) => a - b));

    const build = (): World => {
      const world = createWorld(7);
      grantAllSeeds(world);
      for (const tile of [toIndexUnchecked(29, 29), toIndexUnchecked(30, 30)]) {
        tillTile(world, tile);
        plantCrop(world, tile, CORE_TURNIP);
      }
      stepSimulationBy(world, 100);
      return world;
    };

    expect(snapshot(build())).toBe(snapshot(build()));
  });
});
