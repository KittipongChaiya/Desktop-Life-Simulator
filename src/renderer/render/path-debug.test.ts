/**
 * Pathfinding debug overlay — the arithmetic. Phase-07.8j.
 *
 * The Pixi half follows `highlight.ts` and `chunk-debug.ts`, untested for the
 * same reason. What is tested is what decides where the lines go and what
 * colour the heatmap is — the parts that can be silently wrong while the
 * overlay still looks like an overlay.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import { asTileIndex } from '../../shared/ids';

import { costTint, remainingRoute, tileCentre } from './path-debug';

describe('tileCentre', () => {
  it('centres on the tile rather than its corner', () => {
    expect(tileCentre(toIndexUnchecked(0, 0))).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2 });
  });

  it('places a tile at its grid position', () => {
    expect(tileCentre(toIndexUnchecked(3, 5))).toEqual({
      x: 3 * TILE_SIZE + TILE_SIZE / 2,
      y: 5 * TILE_SIZE + TILE_SIZE / 2,
    });
  });

  it('reports nothing for an index off the grid, rather than drawing at NaN', () => {
    expect(tileCentre(asTileIndex(-1))).toBeNull();
    expect(tileCentre(asTileIndex(999_999))).toBeNull();
  });
});

describe('remainingRoute', () => {
  const path = [
    toIndexUnchecked(0, 0),
    toIndexUnchecked(1, 0),
    toIndexUnchecked(2, 0),
    toIndexUnchecked(3, 0),
  ];

  it('draws only what is still to be walked', () => {
    // A worker three tiles into a four-tile route is walking one more. Drawing
    // the whole plan would make a nearly-finished trip look like a new one.
    expect(remainingRoute(path, 3)).toEqual([tileCentre(path[3] ?? asTileIndex(0))]);
  });

  it('draws the whole route before the first step', () => {
    expect(remainingRoute(path, 0)).toHaveLength(4);
  });

  it('draws nothing once the route is walked out', () => {
    expect(remainingRoute(path, 4)).toEqual([]);
    expect(remainingRoute(path, 99)).toEqual([]);
  });

  it('treats a negative cursor as the start rather than wrapping', () => {
    expect(remainingRoute(path, -2)).toHaveLength(4);
  });

  it('has nothing to draw for an idle worker', () => {
    expect(remainingRoute([], 0)).toEqual([]);
  });

  it('drops an unplottable tile instead of failing the frame', () => {
    expect(remainingRoute([asTileIndex(999_999), toIndexUnchecked(1, 1)], 0)).toHaveLength(1);
  });
});

describe('costTint', () => {
  it('reads the cheap end at the minimum and the dear end at the maximum', () => {
    expect(costTint(1, 1, 4)).toBe(costTint(1, 1, 4));
    expect(costTint(1, 1, 4)).not.toBe(costTint(4, 1, 4));
  });

  it('clamps outside the range rather than producing an invalid colour', () => {
    expect(costTint(-5, 1, 4)).toBe(costTint(1, 1, 4));
    expect(costTint(99, 1, 4)).toBe(costTint(4, 1, 4));
  });

  it('reads a uniform world as cheap rather than dividing by zero', () => {
    // Every tile is grass until a path is laid, so this is the ordinary case.
    const tint = costTint(2, 2, 2);

    expect(Number.isNaN(tint)).toBe(false);
    expect(tint).toBe(costTint(1, 1, 4));
  });

  it('stays a valid 24-bit colour across the ramp', () => {
    for (const cost of [1, 2, 3, 4]) {
      const tint = costTint(cost, 1, 4);
      expect(Number.isInteger(tint)).toBe(true);
      expect(tint).toBeGreaterThanOrEqual(0);
      expect(tint).toBeLessThanOrEqual(0xffffff);
    }
  });
});
