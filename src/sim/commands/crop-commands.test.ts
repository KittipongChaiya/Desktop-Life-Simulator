/**
 * Crop command tests. Phase-03.
 *
 * Every event introduced here is exercised for PRODUCER, DELIVERY, CONSUMER
 * EXECUTION, and ORDERING — an event lacking any of the four is incomplete
 * (ADR-008).
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, type TileIndex } from '../../shared/ids';
import { CORE_PUMPKIN, CORE_TURNIP, CORE_WHEAT, stageFor } from '../content/crops';
import { stepSimulationBy } from '../tick';
import { elapsedTicks } from '../world/crop';
import { TileState, tileStateAt } from '../world/tile-state';
import { createWorld, type World } from '../world/world';

import { harvestCrop, plantCrop, tillTile } from './crop-commands';

/** Tiles inside and outside the centred 8x8 starting plot. */
const OWNED: TileIndex = toIndexUnchecked(30, 30);
const OUTSIDE: TileIndex = toIndexUnchecked(2, 2);

function readyWorld(): World {
  const world = createWorld(1);
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
    stepSimulationBy(world, 2400);

    expect(harvestCrop(world, OWNED).ok).toBe(true);
    expect(world.crops.size).toBe(0);
  });

  it('rejects harvesting the same crop twice', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, 2400);
    harvestCrop(world, OWNED);

    expect(harvestCrop(world, OWNED).ok).toBe(false);
  });
});

describe('growth progression', () => {
  it('advances through stages monotonically and never regresses', () => {
    const world = readyWorld();
    const definition = world.cropRegistry.get(CORE_WHEAT);
    if (!definition.ok) throw new Error('setup failed');

    const stages: number[] = [];
    for (let elapsed = 0; elapsed <= 2400; elapsed += 100) {
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

    stepSimulationBy(world, 2399);
    expect(harvestCrop(world, OWNED).ok).toBe(false);

    stepSimulationBy(world, 1);
    expect(harvestCrop(world, OWNED).ok).toBe(true);
  });

  it('grows multiple crops independently', () => {
    const world = createWorld(1);
    const early = toIndexUnchecked(29, 29);
    const late = toIndexUnchecked(31, 31);
    tillTile(world, early);
    tillTile(world, late);

    plantCrop(world, early, CORE_TURNIP);
    stepSimulationBy(world, 500);
    plantCrop(world, late, CORE_WHEAT);
    stepSimulationBy(world, 400);

    // Turnip (900t) is ready; wheat (2400t), planted later, is not.
    expect(harvestCrop(world, early).ok).toBe(true);
    expect(harvestCrop(world, late).ok).toBe(false);
  });
});

describe('derived tile state (ADR-009 §1)', () => {
  it('reports every state without storing any of them', () => {
    const world = createWorld(1);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Empty);

    tillTile(world, OWNED);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Tilled);

    plantCrop(world, OWNED, CORE_WHEAT);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Planted);

    stepSimulationBy(world, 1200);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.Growing);

    stepSimulationBy(world, 1200);
    expect(tileStateAt(query(world), OWNED)).toBe(TileState.HarvestReady);
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

  it('produces cropHarvested carrying its yields', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    stepSimulationBy(world, 2400);

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
    stepSimulationBy(world, 2400);
    harvestCrop(world, OWNED);
    world.events.flush();

    expect(world.cropStats.planted).toBe(1);
    expect(world.cropStats.harvested).toBe(1);
    expect(world.cropStats.lastActivityTick).toBeGreaterThan(0);
  });

  it('delivers events in publish order', () => {
    const world = createWorld(1);
    const order: string[] = [];
    world.events.subscribe('cropPlanted', () => order.push('planted'));
    world.events.subscribe('cropHarvested', () => order.push('harvested'));

    tillTile(world, OWNED);
    plantCrop(world, OWNED, CORE_TURNIP);
    stepSimulationBy(world, 900);
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
      tillTile(world, OWNED);
      plantCrop(world, OWNED, CORE_WHEAT);
      stepSimulationBy(world, 2400);
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
    stepSimulationBy(continuous, 2400);

    const offline = readyWorld();
    plantCrop(offline, OWNED, CORE_WHEAT);
    offline.tick += 2400; // a gap: no ticks are run at all

    const grown = continuous.crops.get(OWNED);
    const skipped = offline.crops.get(OWNED);
    if (grown === undefined || skipped === undefined) throw new Error('setup failed');

    expect(elapsedTicks(skipped, offline.tick)).toBe(elapsedTicks(grown, continuous.tick));
    expect(harvestCrop(offline, OWNED).ok).toBe(true);
  });

  it('leaves a crop planted before an eight-hour gap ready after it', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_PUMPKIN);
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
