/**
 * Chunk debug overlay — the arithmetic. Phase-07.8i.
 *
 * The Pixi half follows `highlight.ts`, which is untested for the same reason:
 * it issues draw calls and there is no GPU here. What IS tested is everything
 * that decides WHAT gets drawn — bounds, the redraw tally, and the label —
 * because those are the parts that can be silently wrong while the overlay
 * still looks like an overlay.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../shared/constants';

import { accumulateRedraws, chunkBounds, chunkLabel } from './chunk-debug';
import { CHUNK_SIZE, CHUNKS_X } from './terrain-chunks';

describe('chunkBounds', () => {
  it('places chunk zero at the world origin', () => {
    expect(chunkBounds(0)).toEqual({
      x: 0,
      y: 0,
      width: CHUNK_SIZE * TILE_SIZE,
      height: CHUNK_SIZE * TILE_SIZE,
    });
  });

  it('advances by a whole chunk across a row, and wraps to the next', () => {
    expect(chunkBounds(1).x).toBe(CHUNK_SIZE * TILE_SIZE);
    expect(chunkBounds(1).y).toBe(0);

    const firstOfSecondRow = chunkBounds(CHUNKS_X);
    expect(firstOfSecondRow.x).toBe(0);
    expect(firstOfSecondRow.y).toBe(CHUNK_SIZE * TILE_SIZE);
  });

  it('covers exactly one chunk of tiles, so borders meet without gaps', () => {
    const first = chunkBounds(0);
    const second = chunkBounds(1);

    expect(first.x + first.width).toBe(second.x);
  });
});

describe('accumulateRedraws', () => {
  it('counts every chunk that was about to be redrawn', () => {
    expect(accumulateRedraws([0, 0, 0], [0, 2])).toEqual([1, 0, 1]);
  });

  it('accumulates across frames', () => {
    let counts: readonly number[] = [0, 0];
    for (let i = 0; i < 3; i += 1) counts = accumulateRedraws(counts, [1]);

    expect(counts).toEqual([0, 3]);
  });

  it('returns the same array when nothing was stale', () => {
    // A cached frame must not allocate: this runs inside the draw path, and
    // ADR-001's whole point is that a static world costs nothing.
    const counts: readonly number[] = [1, 2];

    expect(accumulateRedraws(counts, [])).toBe(counts);
  });

  it('never mutates the counts it was given', () => {
    const counts: readonly number[] = [0, 0];
    const next = accumulateRedraws(counts, [0]);

    expect(counts).toEqual([0, 0]);
    expect(next).not.toBe(counts);
  });

  it('ignores a chunk index outside the world', () => {
    expect(accumulateRedraws([0], [5, -1])).toEqual([0]);
  });
});

describe('chunkLabel', () => {
  it('names the chunk and its redraw count', () => {
    expect(chunkLabel(7, 3)).toBe('#7 ×3');
  });

  it('shows zero rather than nothing, so "never redrawn" is visible', () => {
    expect(chunkLabel(0, 0)).toBe('#0 ×0');
  });
});
