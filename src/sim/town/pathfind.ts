/**
 * The town pathfinder. Phase-19 — ADR-031 §3.
 *
 * Deliberately NOT the farm's A* (`pathing/astar.ts`): that one reads live
 * blocked bits, and a resident's position is a pure derivation whose inputs
 * must never include anything the player can change. This one reads only
 * CONTENT — the town layout — so a route between two town tiles is a constant
 * of the build, cacheable forever, and no shed the player places can reach a
 * derived position.
 *
 * The walkable set is the town region (x ≥ TOWN_MIN_X) minus the town
 * buildings, which never move (no command reaches one — phase-18's guards).
 * Town ground is exactly two kinds by construction: `foundTown` stamps
 * `core:path` streets and leaves grass elsewhere, so the edge weights are
 * those two kinds' movement costs and nothing else.
 *
 * Same determinism discipline as the farm's A*: fixed N/E/S/W neighbour
 * order, ties broken by lowest tile index, so the same route comes back
 * forever.
 */

import { TOWN_MIN_X, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { TOWN_PLACEMENTS, townPathTiles } from '../content/town';
import { moveTicksForCost } from '../world/worker';

export interface TownPoint {
  readonly x: number;
  readonly y: number;
}

const key = (p: TownPoint): number => p.y * WORLD_WIDTH + p.x;

/** Tiles a town building stands on — permanent obstacles (ADR-030 §3). */
const BLOCKED: ReadonlySet<number> = new Set(TOWN_PLACEMENTS.map(key));

/** Street tiles, which cost the path stride rather than the grass one. */
const STREETS: ReadonlySet<number> = new Set(townPathTiles().map(key));

/** Grass and path movement costs, per the core tile kinds (`content.ts`). */
const GRASS_TICKS = moveTicksForCost(1);
const PATH_TICKS = moveTicksForCost(0.7);

export function isTownWalkable(point: TownPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= TOWN_MIN_X &&
    point.x < WORLD_WIDTH &&
    point.y >= 0 &&
    point.y < WORLD_HEIGHT &&
    !BLOCKED.has(key(point))
  );
}

/** Ticks a resident spends entering a tile — the A* edge weight. */
export function townEnterTicks(point: TownPoint): number {
  return STREETS.has(key(point)) ? PATH_TICKS : GRASS_TICKS;
}

/**
 * Routes between town points are constants of the content, so the cache is
 * module-level and unbounded in principle; in practice its size is bounded by
 * the square of the handful of stops the itineraries draw from.
 */
const routes = new Map<string, readonly TownPoint[] | null>();

/**
 * The route from `from` to `to`, both inclusive, or null when unreachable.
 *
 * A* over the static town view. `from === to` returns a single-tile route,
 * which callers treat as an already-arrived walk.
 */
export function townRoute(from: TownPoint, to: TownPoint): readonly TownPoint[] | null {
  const cacheKey = `${String(key(from))}>${String(key(to))}`;
  const cached = routes.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = search(from, to);
  routes.set(cacheKey, result);
  return result;
}

function search(from: TownPoint, to: TownPoint): readonly TownPoint[] | null {
  if (!isTownWalkable(from) || !isTownWalkable(to)) return null;
  if (from.x === to.x && from.y === to.y) return [from];

  const open = new Set<number>([key(from)]);
  const gScore = new Map<number, number>([[key(from), 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();

  const pointOf = (k: number): TownPoint => ({
    x: k % WORLD_WIDTH,
    y: Math.floor(k / WORLD_WIDTH),
  });
  const heuristic = (k: number): number => {
    const p = pointOf(k);
    return (Math.abs(p.x - to.x) + Math.abs(p.y - to.y)) * PATH_TICKS;
  };

  while (open.size > 0) {
    // Lowest f = g + h; ties by lowest tile index — deterministic forever.
    let best = -1;
    let bestF = Infinity;
    for (const k of open) {
      const f = (gScore.get(k) ?? Infinity) + heuristic(k);
      if (f < bestF || (f === bestF && k < best)) {
        best = k;
        bestF = f;
      }
    }

    if (best === key(to)) {
      const path: TownPoint[] = [];
      let walk: number | undefined = best;
      while (walk !== undefined) {
        path.push(pointOf(walk));
        walk = cameFrom.get(walk);
      }
      return path.reverse();
    }

    open.delete(best);
    closed.add(best);

    const here = pointOf(best);
    // Fixed N/E/S/W order, matching `shared/geometry.ts`'s rule.
    const steps: readonly TownPoint[] = [
      { x: here.x, y: here.y - 1 },
      { x: here.x + 1, y: here.y },
      { x: here.x, y: here.y + 1 },
      { x: here.x - 1, y: here.y },
    ];
    for (const next of steps) {
      if (!isTownWalkable(next)) continue;
      const nextKey = key(next);
      if (closed.has(nextKey)) continue;
      const tentative = (gScore.get(best) ?? Infinity) + townEnterTicks(next);
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, tentative);
        cameFrom.set(nextKey, best);
        open.add(nextKey);
      }
    }
  }

  return null;
}
