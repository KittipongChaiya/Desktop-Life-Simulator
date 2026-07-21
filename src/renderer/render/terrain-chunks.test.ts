/**
 * Terrain chunk tests. Phase-02 acceptance criterion 7.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex } from '../../shared/ids';

import {
  CHUNK_COUNT,
  CHUNK_SIZE,
  CHUNKS_X,
  chunkOfTile,
  chunkOrigin,
  chunksInColumnRange,
  createChunkTracker,
} from './terrain-chunks';

/** Marks every chunk clean, simulating a completed first render. */
function freshlyRendered() {
  const tracker = createChunkTracker();
  for (let chunk = 0; chunk < CHUNK_COUNT; chunk += 1) tracker.markClean(chunk);
  return tracker;
}

describe('chunk geometry', () => {
  it('maps the origin tile to chunk 0', () => {
    expect(chunkOfTile(asTileIndex(0))).toBe(0);
  });

  it('keeps a whole chunk together', () => {
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        expect(chunkOfTile(asTileIndex(y * WORLD_WIDTH + x))).toBe(0);
      }
    }
  });

  it('moves to the next chunk at the boundary', () => {
    expect(chunkOfTile(asTileIndex(CHUNK_SIZE))).toBe(1);
    expect(chunkOfTile(asTileIndex(CHUNK_SIZE * WORLD_WIDTH))).toBe(CHUNKS_X);
  });

  it('covers a 64x64 world in 16 chunks', () => {
    // 16 quads per frame instead of 4,096 sprites (ADR-001).
    expect(CHUNK_COUNT).toBe(16);
  });

  it('round-trips chunk origins', () => {
    for (let chunk = 0; chunk < CHUNK_COUNT; chunk += 1) {
      const origin = chunkOrigin(chunk);
      expect(chunkOfTile(asTileIndex(origin.y * WORLD_WIDTH + origin.x))).toBe(chunk);
    }
  });
});

describe('column culling', () => {
  it('returns only chunks overlapping the range', () => {
    expect(chunksInColumnRange(0, CHUNK_SIZE - 1)).toEqual([0, 4, 8, 12]);
  });

  it('includes both chunks when a range straddles a boundary', () => {
    const chunks = chunksInColumnRange(CHUNK_SIZE - 1, CHUNK_SIZE);
    expect(chunks).toContain(0);
    expect(chunks).toContain(1);
  });

  it('clips to the world', () => {
    expect(chunksInColumnRange(-50, 9999)).toHaveLength(CHUNK_COUNT);
  });
});

describe('stale tracking (criterion 7)', () => {
  it('starts fully stale because nothing has been drawn yet', () => {
    expect(createChunkTracker().staleCount()).toBe(CHUNK_COUNT);
  });

  it('re-renders exactly one chunk for a single tile change', () => {
    const tracker = freshlyRendered();
    expect(tracker.staleCount()).toBe(0);

    tracker.invalidateTile(asTileIndex(0));
    expect(tracker.staleCount()).toBe(1);
    expect(tracker.staleVisible(0, WORLD_WIDTH - 1)).toEqual([0]);
  });

  it('coalesces many changes within one chunk', () => {
    const tracker = freshlyRendered();
    for (let x = 0; x < CHUNK_SIZE; x += 1) tracker.invalidateTile(asTileIndex(x));

    expect(tracker.staleCount()).toBe(1);
  });

  it('reports only chunks that are both stale and visible', () => {
    const tracker = freshlyRendered();
    tracker.invalidateTile(asTileIndex(WORLD_WIDTH - 1));

    expect(tracker.staleVisible(0, CHUNK_SIZE - 1)).toHaveLength(0);
    expect(tracker.staleVisible(WORLD_WIDTH - CHUNK_SIZE, WORLD_WIDTH - 1).length).toBeGreaterThan(
      0,
    );
  });

  it('clears after re-render', () => {
    const tracker = freshlyRendered();
    tracker.invalidateTile(asTileIndex(0));
    tracker.markClean(0);

    expect(tracker.staleVisible(0, WORLD_WIDTH - 1)).toHaveLength(0);
  });

  it('invalidateAll marks everything stale', () => {
    const tracker = freshlyRendered();
    tracker.invalidateAll();

    expect(tracker.staleCount()).toBe(CHUNK_COUNT);
  });
});
