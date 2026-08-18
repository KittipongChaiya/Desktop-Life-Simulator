/**
 * Terrain sprite selection tests.
 *
 * The tilled-soil rule is the whole of this module's behaviour, and it is the
 * reason the module exists: before it, tilling a tile produced no visual change
 * whatsoever — the renderer keyed terrain off `kind` alone and `kind` does not
 * move when a tile is tilled.
 */

import { describe, expect, it } from 'vitest';

import { WILDS_MIN_X, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex } from '../../shared/ids';
import { createInstalledRegistries } from '../../sim/content/installed';
import { createTileKindRegistry } from '../../sim/content/tile-kinds';
import {
  CORE_WATER,
  TILLED_SPRITE,
  WILD_SPRITE,
  type TileKindRegistry,
} from '../../sim/content/tile-kinds';
import { createTileGrid, setKind, type TileGrid } from '../../sim/world/tile-grid';

import { tileSpriteKey } from './terrain-tiles';

const TILE = toIndexUnchecked(30, 30);

function fixture(): { grid: TileGrid; kinds: TileKindRegistry } {
  const kinds = createInstalledRegistries().tileKinds;
  return { grid: createTileGrid(), kinds };
}

describe('tile sprite selection', () => {
  it('draws a tile as its registered kind', () => {
    const { grid, kinds } = fixture();
    expect(tileSpriteKey(grid, kinds, TILE)).toBe('terrain:grass');

    setKind(grid, TILE, kinds.indexOf(CORE_WATER));
    expect(tileSpriteKey(grid, kinds, TILE)).toBe('terrain:water');
  });

  it('draws tilled soil once the tile has been tilled', () => {
    const { grid, kinds } = fixture();
    grid.tilledAt[TILE] = 1;

    expect(tileSpriteKey(grid, kinds, TILE)).toBe(TILLED_SPRITE);
  });

  it('lets tilled soil override the kind underneath', () => {
    // Tilling leaves `kind` alone (ADR-009 §1) so the ground is never lost.
    // The override is therefore at render time, and must win.
    const { grid, kinds } = fixture();
    grid.tilledAt[TILE] = 1;

    expect(tileSpriteKey(grid, kinds, TILE)).not.toBe('terrain:grass');
  });

  it('leaves neighbouring tiles untouched', () => {
    const { grid, kinds } = fixture();
    grid.tilledAt[TILE] = 1;

    expect(tileSpriteKey(grid, kinds, asTileIndex(TILE + 1))).toBe('terrain:grass');
  });

  it('treats tilledAt 0 as never tilled', () => {
    // `tillTile` clamps to 1 for exactly this reason — a world begins at tick 0.
    const { grid, kinds } = fixture();
    grid.tilledAt[TILE] = 0;

    expect(tileSpriteKey(grid, kinds, TILE)).toBe('terrain:grass');
  });

  it('falls back to the first kind for an unregistered index', () => {
    // A save from a build with more content, or a bug. Neither may throw
    // inside a render pass.
    const { grid, kinds } = fixture();
    grid.kind[TILE] = 200;

    expect(tileSpriteKey(grid, kinds, TILE)).toBe('terrain:grass');
  });

  it('yields an empty key when no kind is registered at all', () => {
    const grid = createTileGrid();
    // A genuinely EMPTY registry, not the installed one — the case under test is
    // a grid whose kind byte resolves to nothing at all.
    expect(tileSpriteKey(grid, createTileKindRegistry(), TILE)).toBe('');
  });
});

describe('the wilds are drawn as wilderness', () => {
  const WILD = toIndexUnchecked(WORLD_WIDTH - 1, 30);

  it('paints untamed ground east of the boundary', () => {
    const { grid, kinds } = fixture();
    expect(tileSpriteKey(grid, kinds, WILD)).toBe(WILD_SPRITE);
  });

  it('leaves the farm as farm grass', () => {
    const { grid, kinds } = fixture();
    expect(tileSpriteKey(grid, kinds, TILE)).toBe('terrain:grass');
  });

  it('draws every gatherable tile as gatherable ground', () => {
    // The property `wild-ground.ts` exists to guarantee, asserted here at the
    // surface that actually paints: a node may never stand on farm grass.
    const { grid, kinds } = fixture();
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
        expect(tileSpriteKey(grid, kinds, toIndexUnchecked(x, y))).toBe(WILD_SPRITE);
      }
    }
  });

  it('overrides GRASS only, so a plugin keeps its water', () => {
    // Wild grass painted over a lake would be exactly the second-source-of-
    // truth drift this override arrangement avoids.
    const { grid, kinds } = fixture();
    setKind(grid, WILD, kinds.indexOf(CORE_WATER));

    expect(tileSpriteKey(grid, kinds, WILD)).toBe('terrain:water');
  });
});
