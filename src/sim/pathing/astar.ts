/**
 * A* pathfinding. Phase-04b, GAME_DESIGN.md §4.
 *
 * 4-directional search over the walkability grid. Two properties are load-
 * bearing and tested:
 *
 * - **Deterministic.** Ties in the open set break by lowest tile index, and
 *   neighbours are always visited in the fixed N/E/S/W order `neighbours()`
 *   gives. No RNG anywhere — identical inputs produce an identical path, which
 *   ADR-007 requires and worker determinism depends on.
 * - **Total.** An unreachable goal returns an explicit `PathUnreachable`
 *   failure; the search never loops forever (every node is finalised at most
 *   once).
 *
 * Edge cost is `moveTicksForCost(tile.moveCost)` — the same integer the movement
 * system spends crossing the tile — so a route over `core:path` is genuinely
 * cheaper and A* prefers it, with no kind special-casing (the tile-kind
 * `moveCost` field is the single source, per ADR-004).
 */

import { appError, ErrorCode } from '../../shared/errors';
import { manhattanDistance, neighbours, toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { err, ok, unwrap, type Result } from '../../shared/result';
import type { TileKindRegistry } from '../content/tile-kinds';
import { getKind, type TileGrid } from '../world/tile-grid';
import { moveTicksForCost } from '../world/worker';

/** The grid data A* reads. `World` satisfies this structurally. */
export interface PathContext {
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
}

/** True if an entity may stand on the tile. Shared with the movement system. */
export function isWalkable(ctx: PathContext, tile: TileIndex): boolean {
  const kind = ctx.tileKinds.byIndex(getKind(ctx.tiles, tile));
  return kind !== undefined && kind.walkable;
}

/** Ticks to enter a tile — the A* edge weight, identical to the movement cost. */
export function enterCost(ctx: PathContext, tile: TileIndex): number {
  const kind = ctx.tileKinds.byIndex(getKind(ctx.tiles, tile));
  return moveTicksForCost(kind?.moveCost ?? 1);
}

/**
 * The open-set node with the lowest f = g + h, ties broken by lowest tile index.
 *
 * A linear scan: v0.1 paths are short (within or near the 8×8 plot), so a heap
 * would be premature. Deterministic because equal-f nodes resolve by index.
 */
function popBest(
  open: Set<TileIndex>,
  gScore: Map<TileIndex, number>,
  goalPos: {
    readonly x: number;
    readonly y: number;
  },
): TileIndex {
  let best: TileIndex | undefined;
  let bestF = Infinity;
  for (const tile of open) {
    const g = gScore.get(tile) ?? Infinity;
    const f = g + manhattanDistance(unwrap(toPosition(tile)), goalPos);
    if (f < bestF || (f === bestF && best !== undefined && tile < best)) {
      best = tile;
      bestF = f;
    }
  }
  // `open` is non-empty when this is called, so `best` is always assigned.
  return best as TileIndex;
}

function reconstruct(cameFrom: Map<TileIndex, TileIndex>, goal: TileIndex): readonly TileIndex[] {
  const path: TileIndex[] = [goal];
  let current = goal;
  let previous = cameFrom.get(current);
  while (previous !== undefined) {
    path.push(previous);
    current = previous;
    previous = cameFrom.get(current);
  }
  return path.reverse();
}

/**
 * The shortest walkable path from `start` to `goal`, inclusive of both.
 *
 * Returns `[start]` when already there. Fails with `PathUnreachable` when the
 * goal is impassable or walled off.
 */
export function findPath(
  ctx: PathContext,
  start: TileIndex,
  goal: TileIndex,
): Result<readonly TileIndex[]> {
  if (!isWalkable(ctx, goal)) {
    return err(appError(ErrorCode.PathUnreachable, 'goal tile is not walkable', { goal }));
  }
  if (start === goal) return ok([start]);

  const goalPos = unwrap(toPosition(goal));
  const open = new Set<TileIndex>([start]);
  const gScore = new Map<TileIndex, number>([[start, 0]]);
  const cameFrom = new Map<TileIndex, TileIndex>();

  while (open.size > 0) {
    const current = popBest(open, gScore, goalPos);
    if (current === goal) return ok(reconstruct(cameFrom, current));
    open.delete(current);

    const currentG = gScore.get(current) ?? Infinity;
    for (const next of neighbours(current)) {
      if (!isWalkable(ctx, next)) continue;
      const tentative = currentG + enterCost(ctx, next);
      if (tentative < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        open.add(next);
      }
    }
  }

  return err(appError(ErrorCode.PathUnreachable, 'no path to goal', { start, goal }));
}
