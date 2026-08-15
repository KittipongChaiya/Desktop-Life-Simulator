/**
 * Ground decoration. Phase-07.5e — `fix/0.1/7.5.md` §Visual.
 *
 * The properties that matter are the ones that keep a cosmetic system from
 * becoming a gameplay one: it never touches the simulation's RNG, it never
 * lands on the farm, and the same world always grows the same trees.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_TILE_COUNT } from '../../shared/constants';
import { asTileIndex } from '../../shared/ids';
import { createTileGrid, setBlocked, setOwned } from '../../sim/world/tile-grid';
import { createWorld } from '../../sim/world/world';

import { MAX_DECOR, planDecor } from './decor';

/** Grass is registered first, so its dense index is 0 (`tile-kinds.ts`). */
const GRASS = 0;
const NOT_GRASS = 1;

const grassGrid = (): ReturnType<typeof createTileGrid> => {
  const grid = createTileGrid();
  grid.kind.fill(GRASS);
  return grid;
};

describe('determinism', () => {
  it('the same world always grows the same decoration', () => {
    // Not a nicety: props are not saved, so they are re-planned on every
    // launch. A world whose scenery rearranged itself between sessions would
    // read as a different farm.
    const grid = grassGrid();

    expect(planDecor(grid, 12_345, GRASS)).toEqual(planDecor(grid, 12_345, GRASS));
  });

  it('different seeds grow different decoration', () => {
    const grid = grassGrid();

    expect(planDecor(grid, 1, GRASS)).not.toEqual(planDecor(grid, 2, GRASS));
  });

  it('NEVER consumes the simulation RNG — the property the save depends on', () => {
    // Drawing from `world.rng` would advance the stream the simulation resumes
    // from, desynchronising every future tick from the saved game (ADR-007).
    // Asserted by proving the generator is untouched across a full plan.
    const world = createWorld(4_242);
    world.tiles.kind.fill(GRASS);
    const before = world.rng.getState();

    planDecor(world.tiles, world.seed, GRASS);

    expect(world.rng.getState()).toEqual(before);
  });
});

describe('it stays off the farm', () => {
  it('never places on owned ground', () => {
    const grid = grassGrid();
    for (let index = 0; index < 400; index += 1) setOwned(grid, asTileIndex(index), true);

    const owned = new Set<number>();
    for (let index = 0; index < 400; index += 1) owned.add(index);

    for (const item of planDecor(grid, 7, GRASS)) {
      expect(owned.has(item.tile)).toBe(false);
    }
  });

  it('never places on a blocked tile', () => {
    const grid = grassGrid();
    for (let index = 0; index < WORLD_TILE_COUNT; index += 1) {
      setBlocked(grid, asTileIndex(index), true);
    }

    expect(planDecor(grid, 7, GRASS)).toEqual([]);
  });

  it('only decorates grass — not water, stone, path, or tilled soil', () => {
    const grid = grassGrid();
    grid.kind.fill(NOT_GRASS);

    expect(planDecor(grid, 7, GRASS)).toEqual([]);
  });

  it('a tile that becomes owned loses its decoration on the next plan', () => {
    // Land expansion. Re-planning is how the farm reclaims its scenery.
    const grid = grassGrid();
    const before = planDecor(grid, 99, GRASS);
    expect(before.length).toBeGreaterThan(0);

    const taken = before[0];
    if (taken === undefined) throw new Error('expected at least one prop');
    setOwned(grid, taken.tile, true);

    const after = planDecor(grid, 99, GRASS);
    expect(after.map((item) => item.tile)).not.toContain(taken.tile);
  });
});

describe('bounds and shape', () => {
  it('never exceeds the hard ceiling', () => {
    // No cosmetic system may put an unbounded number of sprites in the scene.
    const grid = grassGrid();

    expect(planDecor(grid, 7, GRASS).length).toBeLessThanOrEqual(MAX_DECOR);
  });

  it('stays sparse — readability outranks visual complexity', () => {
    const grid = grassGrid();
    const items = planDecor(grid, 7, GRASS);

    // Well under one prop per ten tiles across the whole world.
    expect(items.length).toBeLessThan(4_096 / 10);
    expect(items.length).toBeGreaterThan(0);
  });

  it('places at most one prop per tile', () => {
    const grid = grassGrid();
    const items = planDecor(grid, 7, GRASS);

    expect(new Set(items.map((item) => item.tile)).size).toBe(items.length);
  });

  it('uses only sprites the buildings atlas actually contains', () => {
    // A typo here would be an invisible prop in a state nobody tests.
    const allowed = new Set([
      'buildings:tree',
      'buildings:rock',
      'buildings:bush',
      'buildings:flower',
    ]);

    for (const item of planDecor(grassGrid(), 7, GRASS)) {
      expect(allowed.has(item.sprite)).toBe(true);
    }
  });

  it('draws on more than one species — a world of only rocks is a bug', () => {
    const species = new Set(planDecor(grassGrid(), 7, GRASS).map((item) => item.sprite));

    expect(species.size).toBeGreaterThan(1);
  });

  it('keeps every tile index inside the world', () => {
    for (const item of planDecor(grassGrid(), 7, GRASS)) {
      expect(item.tile).toBeGreaterThanOrEqual(0);
      expect(item.tile).toBeLessThan(WORLD_TILE_COUNT);
    }
  });
});
