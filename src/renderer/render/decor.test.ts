/**
 * Ground decoration. Phase-07.5e — `fix/0.1/7.5.md` §Visual.
 *
 * The properties that matter are the ones that keep a cosmetic system from
 * becoming a gameplay one: it never touches the simulation's RNG, it never
 * lands on the farm, and the same world always grows the same trees.
 */

import { Sprites } from '@assets/manifest';
import { describe, expect, it } from 'vitest';

import {
  FARM_SIZE,
  TOWN_MIN_X,
  WILDS_MIN_X,
  WORLD_TILE_COUNT,
  WORLD_WIDTH,
} from '../../shared/constants';
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

describe('the farm gets its own set (phase-37)', () => {
  /** Sprites that mean something, or that would obstruct a plot. */
  const COUNTRYSIDE_ONLY = ['buildings:bush', 'buildings:tree', 'buildings:rock'];

  it('never puts countryside scenery on owned ground', () => {
    // THE RULE THAT DID NOT CHANGE. Rule 4 makes a tree or a rock something a
    // player can work, and a bush on the plot is scenery where somebody wants
    // to build. This used to be enforced by placing nothing at all on owned
    // land; it is enforced by the prop SET now, which is a stronger statement
    // rather than a weaker one.
    const grid = grassGrid();
    for (let index = 0; index < 400; index += 1) setOwned(grid, asTileIndex(index), true);

    const onFarm = planDecor(grid, 7, GRASS).filter((item) => item.tile < 400);

    expect(onFarm.length, 'the farm should not be bare').toBeGreaterThan(0);
    for (const item of onFarm) {
      expect(COUNTRYSIDE_ONLY).not.toContain(item.sprite);
    }
  });

  it('never puts a prop on tilled ground', () => {
    // A crate standing in a furrow hides the crop the player is there to read,
    // and a crop is Tier 1 (`ART_DIRECTION.md` §9.1).
    const grid = grassGrid();
    for (let index = 0; index < 400; index += 1) {
      const tile = asTileIndex(index);
      setOwned(grid, tile, true);
      grid.tilledAt[tile] = 1;
    }

    expect(planDecor(grid, 7, GRASS).filter((item) => item.tile < 400)).toEqual([]);
  });

  it('dresses a bigger plot more thickly than a first-day one', () => {
    // The brief asks the farm to show PROGRESSION — humble at the start, busy
    // later. Density is keyed to how much land is owned, which needs no new
    // state because the grid already knows how big the plot is.
    const small = grassGrid();
    for (let index = 0; index < 60; index += 1) setOwned(small, asTileIndex(index), true);

    const large = grassGrid();
    for (let index = 0; index < 60; index += 1) setOwned(large, asTileIndex(index), true);
    for (let index = WORLD_WIDTH; index < WORLD_WIDTH + 600; index += 1) {
      if (index % WORLD_WIDTH < WILDS_MIN_X) setOwned(large, asTileIndex(index), true);
    }

    const density = (items: ReturnType<typeof planDecor>, owned: number): number =>
      items.filter((item) => item.tile < owned).length / owned;

    // The same first 60 tiles, dressed more thickly because the plot around
    // them grew. Compared on the SAME tiles so eligibility cannot explain it.
    expect(density(planDecor(large, 7, GRASS), 60)).toBeGreaterThan(
      density(planDecor(small, 7, GRASS), 60),
    );
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

  it('a tile that becomes owned trades its scenery for farm dressing', () => {
    // Land expansion. Before phase-37 the tile simply lost its prop; now it
    // may keep A prop, but never the one that meant something.
    const grid = grassGrid();
    const before = planDecor(grid, 99, GRASS);
    expect(before.length).toBeGreaterThan(0);

    const taken = before.find((item) => COUNTRYSIDE_ONLY.includes(item.sprite));
    if (taken === undefined) throw new Error('expected at least one countryside prop');
    setOwned(grid, taken.tile, true);

    const after = planDecor(grid, 99, GRASS);
    const replacement = after.find((item) => item.tile === taken.tile);

    expect(replacement?.sprite).not.toBe(taken.sprite);
    if (replacement !== undefined) expect(COUNTRYSIDE_ONLY).not.toContain(replacement.sprite);
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
    //
    // Checked against the GENERATED MANIFEST rather than a hand-kept list.
    // The list was two sprites long and went stale the moment phase-37 added
    // farm and town sets — which is the failure mode of every allowlist that
    // has to be edited in step with something else. The manifest is the atlas.
    const atlas = new Set<string>(Object.values(Sprites));

    for (const item of planDecor(grassGrid(), 7, GRASS)) {
      expect(atlas.has(item.sprite), `${item.sprite} is not in the atlas`).toBe(true);
    }
  });

  it('places something in every region, so no set is dead', () => {
    // Three prop sets exist and all three must be reachable. A set that is
    // never selected is art nobody ever sees, which is exactly the dead-state
    // problem the project keeps finding.
    const grid = grassGrid();
    for (let index = 0; index < 300; index += 1) setOwned(grid, asTileIndex(index), true);

    const items = planDecor(grid, 7, GRASS);
    const farm = items.filter((item) => item.tile < 300);
    const town = items.filter((item) => item.tile % WORLD_WIDTH >= TOWN_MIN_X);
    const country = items.filter(
      (item) => item.tile >= 300 && item.tile % WORLD_WIDTH < TOWN_MIN_X,
    );

    expect(farm.length, 'the farm is bare').toBeGreaterThan(0);
    expect(town.length, 'the town is bare').toBeGreaterThan(0);
    expect(country.length, 'the countryside is bare').toBeGreaterThan(0);

    // And each region draws from its own vocabulary.
    expect(town.some((item) => item.sprite === 'buildings:lamp')).toBe(true);
    expect(farm.every((item) => item.sprite !== 'buildings:lamp')).toBe(true);
    expect(country.every((item) => item.sprite !== 'buildings:crate')).toBe(true);
  });

  it('never draws a tree or a rock — those mean something now', () => {
    // Rule 4. The wilds' nodes use these two sprites, so a cosmetic copy of
    // one is a thing the player will walk to and find they cannot work.
    // Excluding the wilds alone was not enough: a live look showed identical
    // trees either side of the boundary.
    const species = new Set(planDecor(grassGrid(), 7, GRASS).map((item) => item.sprite));

    expect(species.has('buildings:tree')).toBe(false);
    expect(species.has('buildings:rock')).toBe(false);
  });

  it('draws on more than one species — a world of only bushes is a bug', () => {
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

describe('decoration stays out of the wilds', () => {
  it('places nothing east of the boundary', () => {
    // THE DEFECT THIS CLOSES. Decor draws `buildings:tree` and `buildings:rock`
    // — the exact sprites the timber and stone NODES use. A cosmetic tree
    // standing next to a gatherable one is indistinguishable from it, so the
    // player learns that trees sometimes work and sometimes do not.
    //
    // Phase-27 widened the world and this scan runs over all of it, so decor
    // silently began scattering fakes through the wilds.
    const grid = grassGrid();

    for (const item of planDecor(grid, 7, GRASS)) {
      expect(item.tile % WORLD_WIDTH).toBeLessThan(WILDS_MIN_X);
    }
  });

  it('still decorates the town band it shares with nothing', () => {
    // The exclusion is the WILDS, not everything unowned — the countryside
    // between farm and town is what decor was written for.
    const grid = grassGrid();
    const items = planDecor(grid, 7, GRASS);

    expect(items.some((item) => item.tile % WORLD_WIDTH >= FARM_SIZE)).toBe(true);
  });
});
