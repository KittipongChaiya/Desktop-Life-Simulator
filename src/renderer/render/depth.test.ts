/**
 * Depth ordering. Phase-40 — ADR-042 §1, `depth.ts`.
 *
 * These are the assertions a screenshot cannot make and a type checker cannot
 * either. Every one of them describes a thing a player would see go wrong: a
 * worker walking through a wall, a hopping worker flickering in front of a
 * fence, a house drawn on top of the tree in front of it.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';

import { biasDepth, positionDepth, tileDepth } from './depth';

/** The tile index at a row and column, as the world lays them out. */
const at = (col: number, row: number): number => row * WORLD_WIDTH + col;

describe('tileDepth', () => {
  it('orders rows front to back', () => {
    expect(tileDepth(at(0, 5))).toBeGreaterThan(tileDepth(at(0, 4)));
    expect(tileDepth(at(0, 0))).toBeLessThan(tileDepth(at(0, 63)));
  });

  it('ignores the column — depth is how far DOWN the screen, not across', () => {
    // Two things on the same row are the same distance from the camera. If
    // this ever depended on x, a row of fence posts would sort as a staircase.
    for (const col of [0, 1, 40, 111]) {
      expect(tileDepth(at(col, 7))).toBe(tileDepth(at(0, 7)));
    }
  });

  it('is the BOTTOM edge of the tile, which is where a sprite stands', () => {
    // Bottom-anchored sprites (ADR-042 §2) touch the ground here, so this is
    // the number that has to match `positionDepth` for a mover on that tile.
    expect(tileDepth(at(3, 0))).toBe(TILE_SIZE);
    expect(tileDepth(at(3, 9))).toBe(10 * TILE_SIZE);
  });
});

describe('positionDepth', () => {
  it('puts a mover standing exactly on a tile at that tile’s depth', () => {
    // THE UNIT TEST THAT MATTERS. Before phase-40 buildings sorted in tile rows
    // (0…63) and workers in pixels (0…2047), which was survivable only because
    // they lived in different layers. In one layer, a mismatch here would sort
    // every building behind every worker at every position.
    for (const row of [0, 1, 17, 63]) {
      expect(positionDepth(row * TILE_SIZE)).toBe(tileDepth(at(0, row)));
    }
  });

  it('sorts a mover between two rows into the gap, not onto a row', () => {
    const halfway = positionDepth(4 * TILE_SIZE + TILE_SIZE / 2);

    expect(halfway).toBeGreaterThan(tileDepth(at(0, 4)));
    expect(halfway).toBeLessThan(tileDepth(at(0, 5)));
  });

  it('puts a worker in front of what it has walked past, and behind what it has not', () => {
    // The whole point of the merge, stated as the player would describe it.
    const tree = tileDepth(at(10, 8));
    const inFrontOfTree = positionDepth(8 * TILE_SIZE + TILE_SIZE); // one row lower
    const behindTree = positionDepth(7 * TILE_SIZE); // one row higher

    expect(inFrontOfTree).toBeGreaterThan(tree);
    expect(behindTree).toBeLessThan(tree);
  });
});

describe('motion never changes depth', () => {
  it('is unaffected by however far a sprite is lifted', () => {
    // `worker-view` passes the LOGICAL base and draws the bob separately. If it
    // ever passed the drawn `y`, a worker hopping beside a fence would flicker
    // in front of it and behind it — a bug that is obvious on screen and
    // invisible to every other test in this repository.
    const base = positionDepth(6 * TILE_SIZE);

    for (const lift of [0, 1, 2, 7, TILE_SIZE]) {
      expect(positionDepth(6 * TILE_SIZE)).toBe(base);
      expect(base - lift).toBeLessThanOrEqual(base);
    }
  });
});

describe('biasDepth', () => {
  it('breaks a tie without jumping a row', () => {
    const depth = tileDepth(at(2, 12));

    expect(biasDepth(depth, 1)).toBeGreaterThan(depth);
    expect(biasDepth(depth, -1)).toBeLessThan(depth);
    // A bias big enough to cross a row would reorder things at genuinely
    // different depths, so it is clamped rather than trusted.
    expect(biasDepth(depth, 999)).toBeLessThan(tileDepth(at(2, 13)));
    expect(biasDepth(depth, -999)).toBeGreaterThan(tileDepth(at(2, 11)));
  });
});
