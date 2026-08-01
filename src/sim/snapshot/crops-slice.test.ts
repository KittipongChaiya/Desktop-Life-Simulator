/**
 * Crop projection tests.
 *
 * The load-bearing assertion is REPUBLISH DISCIPLINE: a growing crop must
 * project an identical view on every tick between stage boundaries. A slice
 * that changed per tick would drive the UI at 20 Hz forever and blow the idle
 * CPU budget — the exact failure ADR-005 §2 exists to prevent, and an easy one
 * to introduce here, because growth genuinely does advance every tick.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, type TileIndex } from '../../shared/ids';
import { plantCrop, tillTile } from '../commands/crop-commands';
import { CORE_TURNIP, CORE_WHEAT, STAGE_THRESHOLDS } from '../content/crops';
import { DEFAULT_STACK_SIZE } from '../content/items';
import { addItems } from '../world/container';
import { createWorld, type World } from '../world/world';

import { cropsEqual, projectCrops, type CropProjectionSource } from './crops-slice';

const OWNED: TileIndex = toIndexUnchecked(30, 30);
const NEIGHBOUR: TileIndex = toIndexUnchecked(31, 30);

/** A farm with seeds, two tilled tiles, and nothing planted yet. */
function readyWorld(): World {
  const world = createWorld(1);
  for (const crop of [CORE_TURNIP, CORE_WHEAT]) {
    const definition = world.cropRegistry.get(crop);
    if (!definition.ok) throw new Error('setup failed');
    addItems(world.inventory, definition.value.seedItem, 20, DEFAULT_STACK_SIZE);
  }
  tillTile(world, OWNED);
  tillTile(world, NEIGHBOUR);
  return world;
}

/** The projection source at an arbitrary tick, without stepping the simulation. */
function at(world: World, tick: number): CropProjectionSource {
  return { crops: world.crops, cropRegistry: world.cropRegistry, tick };
}

/** Total ticks the crop takes to mature. */
function growthTicks(world: World, crop = CORE_TURNIP): number {
  const definition = world.cropRegistry.get(crop);
  if (!definition.ok) throw new Error('setup failed');
  return definition.value.growthTicks;
}

/** First tick at which a stage is showing, derived from the shared thresholds. */
function stageStart(total: number, stage: number): number {
  return Math.ceil(total * (STAGE_THRESHOLDS[stage] ?? 0));
}

describe('crop projection', () => {
  it('projects nothing on an empty farm', () => {
    expect(projectCrops(at(createWorld(1), 0))).toEqual([]);
  });

  it('projects a freshly planted crop at its seed sprite', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_TURNIP);

    expect(projectCrops(at(world, 0))).toEqual([{ tile: OWNED, sprite: 'crops:turnip_0' }]);
  });

  it('advances the sprite through all four stages', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_WHEAT);
    const total = growthTicks(world, CORE_WHEAT);

    const spriteAt = (tick: number): string | undefined => projectCrops(at(world, tick))[0]?.sprite;

    expect(spriteAt(0)).toBe('crops:wheat_0');
    expect(spriteAt(stageStart(total, 1))).toBe('crops:wheat_1');
    expect(spriteAt(stageStart(total, 2))).toBe('crops:wheat_2');
    expect(spriteAt(total)).toBe('crops:wheat_3');
  });

  it('projects an identical view on every tick within one stage', () => {
    // The whole point. Growth advances per tick; the VIEW must not.
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_TURNIP);
    const firstBoundary = stageStart(growthTicks(world), 1);

    const baseline = projectCrops(at(world, 0));
    for (let tick = 1; tick < firstBoundary; tick += 1) {
      expect(cropsEqual(baseline, projectCrops(at(world, tick)))).toBe(true);
    }
  });

  it('reports a change exactly at a stage boundary', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_TURNIP);
    const boundary = stageStart(growthTicks(world), 1);

    const before = projectCrops(at(world, boundary - 1));
    expect(cropsEqual(before, projectCrops(at(world, boundary)))).toBe(false);
  });

  it('republishes four times over a crop lifetime, never more', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_TURNIP);

    let published = projectCrops(at(world, 0));
    let count = 1; // the initial publication
    for (let tick = 1; tick <= growthTicks(world); tick += 1) {
      const next = projectCrops(at(world, tick));
      if (cropsEqual(published, next)) continue;
      published = next;
      count += 1;
    }

    expect(count).toBe(4);
  });

  it('orders by tile so the projection is deterministic', () => {
    const world = readyWorld();
    plantCrop(world, NEIGHBOUR, CORE_TURNIP);
    plantCrop(world, OWNED, CORE_WHEAT);

    expect(projectCrops(at(world, 0)).map((view) => view.tile)).toEqual([OWNED, NEIGHBOUR]);
  });

  it('drops a harvested crop from the projection', () => {
    const world = readyWorld();
    plantCrop(world, OWNED, CORE_TURNIP);
    world.crops.delete(OWNED);

    expect(projectCrops(at(world, 0))).toEqual([]);
  });

  it('projects an empty sprite for content that has vanished', () => {
    // An uninstalled plugin. SAVE_FORMAT.md §5.3 quarantines rather than
    // deletes, so the projection must not throw inside a frame.
    const world = readyWorld();
    world.crops.set(OWNED, {
      cropId: asContentId('core:nonexistent'),
      tile: OWNED,
      plantedTick: 0,
    });

    expect(projectCrops(at(world, 0))).toEqual([{ tile: OWNED, sprite: '' }]);
  });
});

describe('crop change test', () => {
  it('treats differing lengths as changed', () => {
    expect(cropsEqual([], [{ tile: OWNED, sprite: 'crops:turnip_0' }])).toBe(false);
  });

  it('treats a same-length, same-content projection as unchanged', () => {
    const view = [{ tile: OWNED, sprite: 'crops:turnip_0' }];
    expect(cropsEqual(view, [{ tile: OWNED, sprite: 'crops:turnip_0' }])).toBe(true);
  });

  it('notices a crop moving tile', () => {
    expect(
      cropsEqual(
        [{ tile: OWNED, sprite: 'crops:turnip_0' }],
        [{ tile: NEIGHBOUR, sprite: 'crops:turnip_0' }],
      ),
    ).toBe(false);
  });
});
