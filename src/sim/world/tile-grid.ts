/**
 * The tile grid. ADR-004 §2.
 *
 * Parallel FLAT TYPED ARRAYS indexed `y * WORLD_WIDTH + x`, not an array of
 * objects. Tiles are dense and uniform — nearly every cell exists and every
 * cell has the same fields — so this layout is compact, cache-friendly, and
 * serializes directly to base64 without a per-tile conversion
 * (`SAVE_FORMAT.md` §2).
 *
 * Converting an array-of-objects grid to this later would touch every tile
 * consumer, which is why it is built this way from the start.
 *
 * `owned` is a BITFIELD: one bit per tile rather than one byte. At 4,096 tiles
 * that is 512 bytes instead of 4 KB — small in absolute terms, but the grid is
 * the one structure that scales with world size, and v0.4 expands the map.
 */

import { WORLD_HEIGHT, WORLD_TILE_COUNT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked, type TilePosition } from '../../shared/geometry';
import { asTileIndex, type TileIndex } from '../../shared/ids';

export interface TileGrid {
  readonly width: number;
  readonly height: number;
  /** Dense tile-kind index into the tile-kind registry. */
  readonly kind: Uint8Array;
  /** One bit per tile. Use `isOwned` / `setOwned`. */
  readonly owned: Uint8Array;
  /** Tick the tile was tilled, or 0. Phase-03. */
  readonly tilledAt: Uint32Array;
  /**
   * Tick the tile was last watered, or 0. Phase-12b — ADR-022 §3.
   *
   * Replaces `moisture`, and the shape change is the point: `moisture` was a
   * 0–100 LEVEL, which is an accumulator, and nothing ever read it. This is a
   * recorded FACT with the same shape as `tilledAt`, so wetness is derived
   * from it and the rainfall since (ADR-009 §1's orthogonal recorded facts).
   *
   * Zero means "never watered", exactly as it does for `tilledAt`.
   */
  readonly wateredAt: Uint32Array;
  /**
   * One bit per tile: a building occupies it and it cannot be walked. Phase-05.
   * Buildings contribute to walkability HERE, in the tile model — pathfinding
   * reads tile walkability and never inspects the buildings store (ADR-011).
   * Use `isBlocked` / `setBlocked`.
   */
  readonly blocked: Uint8Array;
}

export function createTileGrid(): TileGrid {
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    kind: new Uint8Array(WORLD_TILE_COUNT),
    owned: new Uint8Array(Math.ceil(WORLD_TILE_COUNT / 8)),
    tilledAt: new Uint32Array(WORLD_TILE_COUNT),
    wateredAt: new Uint32Array(WORLD_TILE_COUNT),
    blocked: new Uint8Array(Math.ceil(WORLD_TILE_COUNT / 8)),
  };
}

export function isOwned(grid: TileGrid, tile: TileIndex): boolean {
  const byte = grid.owned[tile >> 3];
  if (byte === undefined) return false;
  return (byte & (1 << (tile & 7))) !== 0;
}

export function setOwned(grid: TileGrid, tile: TileIndex, owned: boolean): void {
  const byteIndex = tile >> 3;
  const current = grid.owned[byteIndex];
  if (current === undefined) return;

  const mask = 1 << (tile & 7);
  grid.owned[byteIndex] = owned ? current | mask : current & ~mask;
}

/** True if a building occupies the tile, making it impassable. */
export function isBlocked(grid: TileGrid, tile: TileIndex): boolean {
  const byte = grid.blocked[tile >> 3];
  if (byte === undefined) return false;
  return (byte & (1 << (tile & 7))) !== 0;
}

export function setBlocked(grid: TileGrid, tile: TileIndex, blocked: boolean): void {
  const byteIndex = tile >> 3;
  const current = grid.blocked[byteIndex];
  if (current === undefined) return;

  const mask = 1 << (tile & 7);
  grid.blocked[byteIndex] = blocked ? current | mask : current & ~mask;
}

export function getKind(grid: TileGrid, tile: TileIndex): number {
  return grid.kind[tile] ?? 0;
}

export function setKind(grid: TileGrid, tile: TileIndex, kindIndex: number): void {
  if (tile < 0 || tile >= WORLD_TILE_COUNT) return;
  grid.kind[tile] = kindIndex;
}

/**
 * Marks a centered square of tiles as owned.
 *
 * The starting plot is 8×8 at the world centre (`GAME_DESIGN.md` §2.1);
 * expansions grow it by a ring (phase-06).
 */
export function claimCenteredPlot(grid: TileGrid, size: number): void {
  const half = Math.floor(size / 2);
  const centreX = Math.floor(grid.width / 2);
  const centreY = Math.floor(grid.height / 2);

  for (let y = centreY - half; y < centreY - half + size; y += 1) {
    for (let x = centreX - half; x < centreX - half + size; x += 1) {
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
      setOwned(grid, toIndexUnchecked(x, y), true);
    }
  }
}

/** Bounds of the owned region, or null when nothing is owned. */
export function ownedBounds(grid: TileGrid): { min: TilePosition; max: TilePosition } | null {
  let minX = grid.width;
  let minY = grid.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!isOwned(grid, toIndexUnchecked(x, y))) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  return maxX === -1 ? null : { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Every tile index in a rectangle, clipped to the grid. Used for culling. */
export function tilesInRect(
  grid: TileGrid,
  left: number,
  top: number,
  right: number,
  bottom: number,
): readonly TileIndex[] {
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(grid.width - 1, Math.floor(right));
  const y1 = Math.min(grid.height - 1, Math.floor(bottom));

  const result: TileIndex[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      result.push(asTileIndex(y * grid.width + x));
    }
  }
  return result;
}
