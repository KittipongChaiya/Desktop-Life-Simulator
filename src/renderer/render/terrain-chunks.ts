/**
 * Terrain chunk bookkeeping. ADR-001 §Terrain.
 *
 * Terrain is drawn into cached 16x16-tile textures, re-rendered only when a
 * tile inside them changes. A static 64x64 farm is then 16 quads per frame
 * rather than 4,096 sprites — and combined with the dirty gate, usually zero.
 *
 * This module is the pure half: which chunk owns a tile, which chunks are
 * visible, which are stale. The Pixi RenderTexture cache is built on top of it,
 * so all of the index arithmetic is testable without a GPU.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import type { TileIndex } from '../../shared/ids';

/** Tiles per chunk edge. 16x16 = 256 tiles per cached texture. */
export const CHUNK_SIZE = 16;

export const CHUNKS_X = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
export const CHUNKS_Y = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
export const CHUNK_COUNT = CHUNKS_X * CHUNKS_Y;

export interface ChunkTracker {
  /** Marks the chunk containing a tile as needing re-render. */
  invalidateTile(tile: TileIndex): void;
  /** Marks every chunk stale, e.g. after a zoom change. */
  invalidateAll(): void;
  /** Chunk indices that are both visible and stale, in ascending order. */
  staleVisible(firstColumn: number, lastColumn: number): readonly number[];
  /** Clears a chunk's stale flag after it is re-rendered. */
  markClean(chunk: number): void;
  staleCount(): number;
}

/** Chunk index owning a tile. */
export function chunkOfTile(tile: TileIndex): number {
  const x = tile % WORLD_WIDTH;
  const y = Math.floor(tile / WORLD_WIDTH);
  return Math.floor(y / CHUNK_SIZE) * CHUNKS_X + Math.floor(x / CHUNK_SIZE);
}

/** Chunk indices overlapping an inclusive tile-column range. */
export function chunksInColumnRange(firstColumn: number, lastColumn: number): readonly number[] {
  const firstChunkX = Math.max(0, Math.floor(firstColumn / CHUNK_SIZE));
  const lastChunkX = Math.min(CHUNKS_X - 1, Math.floor(lastColumn / CHUNK_SIZE));

  const result: number[] = [];
  for (let cy = 0; cy < CHUNKS_Y; cy += 1) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx += 1) {
      result.push(cy * CHUNKS_X + cx);
    }
  }
  return result;
}

/** Top-left tile coordinate of a chunk, in tiles. */
export function chunkOrigin(chunk: number): { x: number; y: number } {
  return {
    x: (chunk % CHUNKS_X) * CHUNK_SIZE,
    y: Math.floor(chunk / CHUNKS_X) * CHUNK_SIZE,
  };
}

export function createChunkTracker(): ChunkTracker {
  // Every chunk starts stale: nothing has been rendered yet.
  const stale = new Set<number>(Array.from({ length: CHUNK_COUNT }, (_, i) => i));

  return {
    invalidateTile(tile) {
      stale.add(chunkOfTile(tile));
    },

    invalidateAll() {
      for (let i = 0; i < CHUNK_COUNT; i += 1) stale.add(i);
    },

    staleVisible(firstColumn, lastColumn) {
      return chunksInColumnRange(firstColumn, lastColumn)
        .filter((chunk) => stale.has(chunk))
        .sort((a, b) => a - b);
    },

    markClean(chunk) {
      stale.delete(chunk);
    },

    staleCount: () => stale.size,
  };
}
