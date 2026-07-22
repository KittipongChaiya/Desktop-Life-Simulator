/**
 * Pure worker-render maths. Phase-04c.
 *
 * The geometry and animation timing the worker renderer needs, with no PixiJS
 * dependency — so it is unit-testable without a GPU and the Pixi wrapper
 * (`worker-view.ts`) stays a thin adapter.
 *
 * Interpolation follows ADR-007 §5: the renderer smooths between the last two
 * simulation snapshots by `alpha`, and the result NEVER re-enters the
 * simulation. Animation frames advance in ticks (ASSETS.md §7), read from the
 * generated `Animations` manifest — never a hardcoded frame list.
 */

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import { Direction, type WorkerView } from '../../sim/snapshot/workers-slice';
import { WorkerState } from '../../sim/world/worker';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One animation, in the shape the generated `Animations` manifest emits. */
export interface AnimationDef {
  readonly frames: readonly string[];
  readonly frameTicks: number;
  readonly loop: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Top-left world-pixel position of a tile. */
function tileTopLeft(tile: number): Point {
  const y = Math.floor(tile / WORLD_WIDTH);
  return { x: (tile - y * WORLD_WIDTH) * TILE_SIZE, y: y * TILE_SIZE };
}

/** A single snapshot's sub-tile position (between `tile` and `toTile`). */
function snapshotPosition(view: WorkerView): Point {
  const from = tileTopLeft(view.tile);
  const to = tileTopLeft(view.toTile);
  return {
    x: lerp(from.x, to.x, view.moveFraction),
    y: lerp(from.y, to.y, view.moveFraction),
  };
}

/**
 * The worker's world-pixel position this frame: the previous snapshot lerped
 * toward the current one by `alpha`. `prev === current` (a stationary worker)
 * collapses to the tile position.
 */
export function interpolatedPosition(prev: WorkerView, current: WorkerView, alpha: number): Point {
  const a = snapshotPosition(prev);
  const b = snapshotPosition(current);
  return { x: lerp(a.x, b.x, alpha), y: lerp(a.y, b.y, alpha) };
}

const DIRECTION_SUFFIX: Readonly<Record<Direction, string>> = {
  [Direction.North]: 'n',
  [Direction.South]: 's',
  [Direction.East]: 'e',
  [Direction.West]: 'w',
};

/** The animation name for a worker's state and facing, e.g. `walk_s` / `idle_n`. */
export function selectAnimation(state: WorkerState, facing: Direction): string {
  const action = state === WorkerState.Moving ? 'walk' : 'idle';
  return `${action}_${DIRECTION_SUFFIX[facing]}`;
}

/**
 * The sprite key to show this tick. A `frameTicks` of 0 is a single-frame
 * (non-animating) definition and always shows frame 0.
 */
export function currentFrame(def: AnimationDef, tick: number): string {
  if (def.frameTicks <= 0 || def.frames.length <= 1) return def.frames[0] ?? '';
  const index = Math.floor(tick / def.frameTicks) % def.frames.length;
  return def.frames[index] ?? def.frames[0] ?? '';
}

/** True if the worker's column falls outside the visible column range. */
export function isColumnCulled(tile: number, firstColumn: number, lastColumn: number): boolean {
  const column = tile % WORLD_WIDTH;
  return column < firstColumn || column > lastColumn;
}
