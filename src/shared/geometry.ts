/**
 * Grid geometry.
 *
 * The tile grid is stored as flat typed arrays indexed `y * WORLD_WIDTH + x`
 * (ADR-004 §2). These helpers are the only sanctioned way to convert between
 * coordinates and indices — hand-rolled arithmetic at call sites is how
 * off-by-one grid bugs get in.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { appError, ErrorCode } from './errors';
import { asTileIndex, type TileIndex } from './ids';
import { err, ok, type Result } from './result';

export interface TilePosition {
  readonly x: number;
  readonly y: number;
}

/** True if the coordinate lies inside the world grid. */
export function isInBounds(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < WORLD_WIDTH &&
    y < WORLD_HEIGHT
  );
}

/** True if the index addresses a tile in the world grid. */
export function isValidIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < WORLD_WIDTH * WORLD_HEIGHT;
}

/**
 * Converts a coordinate to a tile index.
 *
 * Returns an error rather than a wrapped index for out-of-bounds input —
 * silently wrapping is how a worker ends up teleporting across the map.
 */
export function toIndex(x: number, y: number): Result<TileIndex> {
  if (!isInBounds(x, y)) {
    return err(appError(ErrorCode.TileOutOfBounds, 'coordinate outside world grid', { x, y }));
  }
  return ok(asTileIndex(y * WORLD_WIDTH + x));
}

/** Converts a tile index back to a coordinate. */
export function toPosition(index: TileIndex): Result<TilePosition> {
  if (!isValidIndex(index)) {
    return err(appError(ErrorCode.TileOutOfBounds, 'index outside world grid', { index }));
  }
  return ok({ x: index % WORLD_WIDTH, y: Math.floor(index / WORLD_WIDTH) });
}

/**
 * Unchecked coordinate-to-index conversion.
 *
 * For hot loops that have already bounds-checked. Callers are responsible for
 * validity; misuse produces silently wrong indices.
 */
export function toIndexUnchecked(x: number, y: number): TileIndex {
  return asTileIndex(y * WORLD_WIDTH + x);
}

/** Manhattan distance. Movement is 4-directional, so this is the true path cost. */
export function manhattanDistance(a: TilePosition, b: TilePosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * The four orthogonal neighbours of a tile, in fixed N/E/S/W order.
 *
 * Order is deterministic and must stay so: pathfinding tie-breaks depend on
 * neighbour ordering, and determinism is required by ADR-007.
 */
export function neighbours(index: TileIndex): readonly TileIndex[] {
  const position = toPosition(index);
  if (!position.ok) return [];

  const { x, y } = position.value;
  const result: TileIndex[] = [];
  if (y > 0) result.push(toIndexUnchecked(x, y - 1));
  if (x < WORLD_WIDTH - 1) result.push(toIndexUnchecked(x + 1, y));
  if (y < WORLD_HEIGHT - 1) result.push(toIndexUnchecked(x, y + 1));
  if (x > 0) result.push(toIndexUnchecked(x - 1, y));
  return result;
}
