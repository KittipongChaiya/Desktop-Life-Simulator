/**
 * Tile grid tests. Phase-02 acceptance criteria 1 and 2.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_HEIGHT, WORLD_TILE_COUNT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex } from '../../shared/ids';
import { createInstalledRegistries } from '../content/installed';
import { CORE_GRASS } from '../content/tile-kinds';

import {
  claimCenteredPlot,
  createTileGrid,
  getKind,
  isOwned,
  ownedBounds,
  setKind,
  setOwned,
  tilesInRect,
} from './tile-grid';

describe('layout', () => {
  it('allocates one entry per tile', () => {
    const grid = createTileGrid();

    expect(grid.kind.length).toBe(WORLD_TILE_COUNT);
    expect(grid.tilledAt.length).toBe(WORLD_TILE_COUNT);
    expect(grid.moisture.length).toBe(WORLD_TILE_COUNT);
  });

  it('packs ownership one bit per tile', () => {
    // 512 bytes instead of 4 KB. The grid is the one structure that scales
    // with world size (ADR-004 §2).
    expect(createTileGrid().owned.length).toBe(WORLD_TILE_COUNT / 8);
  });

  it('starts as an all-zero grass world with no fill pass', () => {
    const grid = createTileGrid();
    const registry = createInstalledRegistries().tileKinds;

    expect(registry.indexOf(CORE_GRASS)).toBe(0);
    expect(grid.kind.every((value) => value === 0)).toBe(true);
  });
});

describe('ownership bitfield', () => {
  it('round-trips a single tile', () => {
    const grid = createTileGrid();
    const tile = asTileIndex(1234);

    expect(isOwned(grid, tile)).toBe(false);
    setOwned(grid, tile, true);
    expect(isOwned(grid, tile)).toBe(true);
    setOwned(grid, tile, false);
    expect(isOwned(grid, tile)).toBe(false);
  });

  it('does not disturb neighbouring bits in the same byte', () => {
    // The classic bitfield bug: writing one bit clobbers the other seven.
    const grid = createTileGrid();
    for (let i = 0; i < 8; i += 1) setOwned(grid, asTileIndex(i), true);

    setOwned(grid, asTileIndex(3), false);

    for (let i = 0; i < 8; i += 1) {
      expect(isOwned(grid, asTileIndex(i))).toBe(i !== 3);
    }
  });

  it('round-trips every tile in the world', () => {
    const grid = createTileGrid();
    for (let tile = 0; tile < WORLD_TILE_COUNT; tile += 1) {
      setOwned(grid, asTileIndex(tile), true);
    }
    for (let tile = 0; tile < WORLD_TILE_COUNT; tile += 1) {
      expect(isOwned(grid, asTileIndex(tile))).toBe(true);
    }
  });

  it('reports out-of-range tiles as unowned rather than throwing', () => {
    const grid = createTileGrid();
    expect(isOwned(grid, asTileIndex(WORLD_TILE_COUNT + 10))).toBe(false);
  });
});

describe('starting plot', () => {
  it('claims exactly size x size tiles', () => {
    const grid = createTileGrid();
    claimCenteredPlot(grid, 8);

    let owned = 0;
    for (let tile = 0; tile < WORLD_TILE_COUNT; tile += 1) {
      if (isOwned(grid, asTileIndex(tile))) owned += 1;
    }
    expect(owned).toBe(64);
  });

  it('centres the plot', () => {
    const grid = createTileGrid();
    claimCenteredPlot(grid, 8);

    const bounds = ownedBounds(grid);
    expect(bounds).not.toBeNull();
    expect(bounds?.min).toEqual({ x: 28, y: 28 });
    expect(bounds?.max).toEqual({ x: 35, y: 35 });
  });

  it('reports null bounds when nothing is owned', () => {
    expect(ownedBounds(createTileGrid())).toBeNull();
  });
});

describe('kinds', () => {
  it('round-trips a kind index', () => {
    const grid = createTileGrid();
    setKind(grid, asTileIndex(100), 2);
    expect(getKind(grid, asTileIndex(100))).toBe(2);
  });

  it('ignores out-of-range writes instead of corrupting memory', () => {
    const grid = createTileGrid();
    setKind(grid, asTileIndex(WORLD_TILE_COUNT), 2);
    expect(getKind(grid, asTileIndex(0))).toBe(0);
  });
});

describe('rect queries (culling)', () => {
  it('returns the tiles inside a rectangle', () => {
    const grid = createTileGrid();
    expect(tilesInRect(grid, 0, 0, 1, 1)).toEqual([
      toIndexUnchecked(0, 0),
      toIndexUnchecked(1, 0),
      toIndexUnchecked(0, 1),
      toIndexUnchecked(1, 1),
    ]);
  });

  it('clips to the grid rather than wrapping', () => {
    const grid = createTileGrid();
    const tiles = tilesInRect(grid, -10, -10, WORLD_WIDTH + 10, WORLD_HEIGHT + 10);
    expect(tiles).toHaveLength(WORLD_TILE_COUNT);
  });

  it('returns nothing for a rectangle outside the world', () => {
    const grid = createTileGrid();
    expect(tilesInRect(grid, 1000, 1000, 2000, 2000)).toHaveLength(0);
  });
});
