/**
 * Pathfinding debug overlay. Phase-07.8j, ADR-018 §8.
 *
 * Draws the routes workers are walking, and — when asked — a heatmap of what
 * each tile costs to enter. Like the chunk overlay it draws from inside the
 * existing draw path and dirties nothing, so an open overlay cannot hold the
 * render loop awake.
 *
 * WHAT §6 ASKS FOR AND THIS DOES NOT DRAW: the open and closed sets. They exist
 * only as locals inside `findPath` while a search runs, and the search is over
 * before any frame is drawn. Reaching them needs an observer parameter on the
 * pathfinder — a behaviour change to `src/sim` made for a debug tool, which
 * this phase's hard constraint forbids and ADR-018 §1 refuses on principle.
 * Re-implementing A* here to reproduce them would be worse: a second copy of
 * the pathfinder, free to disagree with the one the game uses, which is exactly
 * the drift `astar.ts` warns about. So the two halves that ARE honestly
 * reachable are drawn, and the third is named rather than faked.
 *
 * The route itself is not a projection either — `WorkerView` carries a tile and
 * a next tile, never the plan. It comes from the `Worker` record, the same
 * source and the same reasoning as 07.8d's entity inspector.
 */

import { Container, Graphics } from 'pixi.js';

import { TILE_SIZE } from '../../shared/constants';
import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';

const ROUTE_TINT = 0x39d0ff;
const ROUTE_WIDTH = 2;
const ROUTE_ALPHA = 0.85;
const GOAL_RADIUS = 5;

/** Heatmap ramp. Cyan is cheap, amber is dear — no red, which is reserved. */
const CHEAP_TINT = 0x39d0ff;
const DEAR_TINT = 0xffb347;
const HEAT_ALPHA = 0.28;

/** Centre of a tile in world pixels, or null for an index off the grid. */
export function tileCentre(tile: TileIndex): { x: number; y: number } | null {
  const position = toPosition(tile);
  if (!position.ok) return null;

  return {
    x: position.value.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.value.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

/**
 * The part of a route still to be walked, as world-pixel points.
 *
 * From the cursor onward: a worker four tiles into a six-tile route is walking
 * two more, and drawing the whole plan would make a nearly-finished trip look
 * like one just begun.
 */
export function remainingRoute(
  path: readonly TileIndex[],
  cursor: number,
): readonly { x: number; y: number }[] {
  const from = Math.max(0, Math.min(cursor, path.length));

  return path
    .slice(from)
    .map(tileCentre)
    .filter((point): point is { x: number; y: number } => point !== null);
}

/**
 * Blends the ramp by cost.
 *
 * Clamped at both ends, and a zero span reads as the cheap end rather than
 * dividing by it — a world of one uniform cost is the ordinary case, not an
 * edge case (every tile is grass until a path is laid).
 */
export function costTint(cost: number, min: number, max: number): number {
  const span = max - min;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (cost - min) / span));

  const blend = (shift: number): number => {
    const from = (CHEAP_TINT >> shift) & 0xff;
    const to = (DEAR_TINT >> shift) & 0xff;
    return Math.round(from + (to - from) * t) << shift;
  };

  return blend(16) | blend(8) | blend(0);
}

export interface PathDebugFrame {
  /** Inclusive tile-column range currently on screen. */
  readonly firstColumn: number;
  readonly lastColumn: number;
}

export interface PathDebugSources {
  /** Routes to draw: one per walking worker. */
  readonly routes: () => readonly {
    readonly path: readonly TileIndex[];
    readonly cursor: number;
  }[];
  /** Ticks to enter a tile — the A* edge weight the search itself uses. */
  readonly enterCost: (tile: TileIndex) => number;
  readonly showRoutes: () => boolean;
  readonly showHeatmap: () => boolean;
  /** Every tile index in the visible rectangle. */
  readonly visibleTiles: (firstColumn: number, lastColumn: number) => readonly TileIndex[];
}

export interface PathDebug {
  update(frame: PathDebugFrame): void;
  destroy(): void;
}

export function createPathDebug(parent: Container, sources: PathDebugSources): PathDebug {
  const root = new Container();
  root.label = 'path-debug';
  parent.addChild(root);

  const heat = new Graphics();
  const routes = new Graphics();
  root.addChild(heat);
  root.addChild(routes);

  return {
    update(frame) {
      const wantRoutes = sources.showRoutes();
      const wantHeat = sources.showHeatmap();
      root.visible = wantRoutes || wantHeat;
      if (!root.visible) return;

      heat.clear();
      routes.clear();

      if (wantHeat) {
        const tiles = sources.visibleTiles(frame.firstColumn, frame.lastColumn);
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const tile of tiles) {
          const cost = sources.enterCost(tile);
          if (cost < min) min = cost;
          if (cost > max) max = cost;
        }

        for (const tile of tiles) {
          const centre = tileCentre(tile);
          if (centre === null) continue;

          heat.rect(centre.x - TILE_SIZE / 2, centre.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
          heat.fill({ color: costTint(sources.enterCost(tile), min, max), alpha: HEAT_ALPHA });
        }
      }

      if (wantRoutes) {
        for (const route of sources.routes()) {
          const points = remainingRoute(route.path, route.cursor);
          if (points.length === 0) continue;

          const [first, ...rest] = points;
          if (first === undefined) continue;

          routes.moveTo(first.x, first.y);
          for (const point of rest) routes.lineTo(point.x, point.y);
          routes.stroke({ width: ROUTE_WIDTH, color: ROUTE_TINT, alpha: ROUTE_ALPHA });

          // The destination, marked: a line that runs off the visible area
          // otherwise gives no clue where it was going.
          const goal = points.at(-1);
          if (goal !== undefined) {
            routes.circle(goal.x, goal.y, GOAL_RADIUS);
            routes.stroke({ width: ROUTE_WIDTH, color: ROUTE_TINT, alpha: ROUTE_ALPHA });
          }
        }
      }
    },

    destroy() {
      root.destroy({ children: true });
    },
  };
}
