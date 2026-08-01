/**
 * Terrain sprite selection tests.
 *
 * The tilled-soil rule is the whole of this module's behaviour, and it is the
 * reason the module exists: before it, tilling a tile produced no visual change
 * whatsoever — the renderer keyed terrain off `kind` alone and `kind` does not
 * move when a tile is tilled.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex } from '../../shared/ids';
import {
  CORE_WATER,
  createTileKindRegistry,
  registerCoreTileKinds,
  TILLED_SPRITE,
  type TileKindRegistry,
} from '../../sim/content/tile-kinds';
import { createTileGrid, setKind, type TileGrid } from '../../sim/world/tile-grid';

import { tileSpriteKey } from './terrain-tiles';

const TILE = toIndexUnchecked(30, 30);

function fixture(): { grid: TileGrid; kinds: TileKindRegistry } {
  const kinds = createTileKindRegistry();
  registerCoreTileKinds(kinds);
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
    expect(tileSpriteKey(grid, createTileKindRegistry(), TILE)).toBe('');
  });
});
