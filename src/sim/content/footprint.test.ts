/**
 * Footprint geometry. Phase-41 — ADR-042 §3, `footprint.ts`.
 *
 * Small arithmetic guarding a large claim: that the simulation knows exactly
 * which tiles a building stands on. Every failure here is a wall a worker can
 * walk through, or a building the player cannot place for no visible reason.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';

import { footprintTiles, isSingleTile, SINGLE_TILE } from './footprint';

const at = (x: number, y: number): number => toIndexUnchecked(x, y);

describe('footprintTiles', () => {
  it('gives back just the tile for a single-tile building', () => {
    // The common case, and the one every definition written before v0.5 uses.
    expect(footprintTiles(toIndexUnchecked(10, 10), SINGLE_TILE)).toEqual([at(10, 10)]);
  });

  it('grows UP and RIGHT from the origin', () => {
    // Up, because a sprite is anchored at its base and the origin row is what
    // the building stands on — so the origin is also its depth, unconverted.
    const tiles = footprintTiles(toIndexUnchecked(5, 9), { width: 3, height: 2 });

    expect(tiles).toEqual([at(5, 8), at(6, 8), at(7, 8), at(5, 9), at(6, 9), at(7, 9)]);
  });

  it('covers exactly width × height tiles, with no repeats', () => {
    const tiles = footprintTiles(toIndexUnchecked(20, 20), { width: 3, height: 3 });

    expect(tiles).toHaveLength(9);
    expect(new Set(tiles).size).toBe(9);
  });

  it('includes the origin, which is where the player clicked', () => {
    const origin = toIndexUnchecked(40, 30);

    expect(footprintTiles(origin, { width: 4, height: 3 })).toContain(origin);
  });

  it('refuses rather than clamping at the top edge', () => {
    // A building that silently shrank at the edge would block fewer tiles than
    // its art covers, and a worker would walk through its wall.
    expect(footprintTiles(toIndexUnchecked(10, 1), { width: 2, height: 3 })).toBeNull();
    // One row lower and it fits exactly.
    expect(footprintTiles(toIndexUnchecked(10, 2), { width: 2, height: 3 })).not.toBeNull();
  });

  it('refuses rather than wrapping at the right edge', () => {
    // THE BUG A ROW-STRIDE LAYOUT INVITES: without this check the rightmost
    // column would silently continue onto the next row's left edge, and a
    // building would block two tiles on opposite sides of the map.
    const tiles = footprintTiles(toIndexUnchecked(WORLD_WIDTH - 2, 10), { width: 3, height: 1 });

    expect(tiles).toBeNull();
  });

  it('fits flush against the right and bottom edges', () => {
    expect(
      footprintTiles(toIndexUnchecked(WORLD_WIDTH - 3, WORLD_HEIGHT - 1), { width: 3, height: 2 }),
    ).not.toBeNull();
  });
});

describe('isSingleTile', () => {
  it('recognises the default', () => {
    expect(isSingleTile(SINGLE_TILE)).toBe(true);
    expect(isSingleTile({ width: 1, height: 2 })).toBe(false);
    expect(isSingleTile({ width: 2, height: 1 })).toBe(false);
  });
});
