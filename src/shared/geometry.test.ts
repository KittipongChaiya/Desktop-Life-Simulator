/**
 * Grid geometry tests.
 *
 * Index/coordinate conversion is used by every tile consumer from phase-02
 * onward, so an off-by-one here would surface as inexplicable behavior far from
 * its cause.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_HEIGHT, WORLD_TILE_COUNT, WORLD_WIDTH } from './constants';
import {
  isInBounds,
  isValidIndex,
  manhattanDistance,
  neighbours,
  toIndex,
  toPosition,
} from './geometry';
import { asTileIndex } from './ids';
import { unwrap } from './result';

describe('index and coordinate round-trip', () => {
  it('round-trips every tile in the world', () => {
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const index = unwrap(toIndex(x, y));
        const position = unwrap(toPosition(index));
        expect(position).toEqual({ x, y });
      }
    }
  });

  it('maps the origin and the final tile correctly', () => {
    expect(unwrap(toIndex(0, 0))).toBe(0);
    expect(unwrap(toIndex(WORLD_WIDTH - 1, WORLD_HEIGHT - 1))).toBe(WORLD_TILE_COUNT - 1);
  });

  it('is row-major', () => {
    expect(unwrap(toIndex(1, 0))).toBe(1);
    expect(unwrap(toIndex(0, 1))).toBe(WORLD_WIDTH);
  });
});

describe('bounds checking', () => {
  it('rejects out-of-bounds coordinates rather than wrapping', () => {
    // Wrapping silently would teleport entities across the map.
    expect(toIndex(-1, 0).ok).toBe(false);
    expect(toIndex(0, -1).ok).toBe(false);
    expect(toIndex(WORLD_WIDTH, 0).ok).toBe(false);
    expect(toIndex(0, WORLD_HEIGHT).ok).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    expect(toIndex(1.5, 0).ok).toBe(false);
    expect(toIndex(0, Number.NaN).ok).toBe(false);
  });

  it('rejects out-of-range indices', () => {
    expect(toPosition(asTileIndex(-1)).ok).toBe(false);
    expect(toPosition(asTileIndex(WORLD_TILE_COUNT)).ok).toBe(false);
    expect(toPosition(asTileIndex(1.5)).ok).toBe(false);
  });

  it('agrees with its predicates', () => {
    expect(isInBounds(0, 0)).toBe(true);
    expect(isInBounds(WORLD_WIDTH, 0)).toBe(false);
    expect(isValidIndex(0)).toBe(true);
    expect(isValidIndex(WORLD_TILE_COUNT)).toBe(false);
  });
});

describe('neighbours', () => {
  it('returns four neighbours for an interior tile', () => {
    const centre = unwrap(toIndex(10, 10));
    expect(neighbours(centre)).toHaveLength(4);
  });

  it('clips at corners and edges', () => {
    expect(neighbours(unwrap(toIndex(0, 0)))).toHaveLength(2);
    expect(neighbours(unwrap(toIndex(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)))).toHaveLength(2);
    expect(neighbours(unwrap(toIndex(5, 0)))).toHaveLength(3);
  });

  it('returns neighbours in a fixed N/E/S/W order', () => {
    // Pathfinding tie-breaks depend on this ordering; determinism requires it
    // to stay stable (ADR-007).
    const centre = unwrap(toIndex(10, 10));
    expect(neighbours(centre)).toEqual([
      unwrap(toIndex(10, 9)),
      unwrap(toIndex(11, 10)),
      unwrap(toIndex(10, 11)),
      unwrap(toIndex(9, 10)),
    ]);
  });

  it('returns an empty list for an invalid index', () => {
    expect(neighbours(asTileIndex(-5))).toEqual([]);
  });

  it('never returns a tile that wraps to the opposite edge', () => {
    // The classic flat-array bug: x-1 at column 0 lands on the previous row.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (const index of neighbours(unwrap(toIndex(0, y)))) {
        expect(unwrap(toPosition(index)).x).not.toBe(WORLD_WIDTH - 1);
      }
    }
  });
});

describe('manhattanDistance', () => {
  it('measures 4-directional path cost', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(manhattanDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { x: 2, y: 9 };
    const b = { x: 14, y: 3 };
    expect(manhattanDistance(a, b)).toBe(manhattanDistance(b, a));
  });
});
