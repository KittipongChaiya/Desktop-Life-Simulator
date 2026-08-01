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

/** Ticks per breath cycle. 20 ticks per second, so this is a slow ~3 s breath. */
const BREATH_TICKS = 60;

const DIRECTION_SUFFIX: Readonly<Record<Direction, string>> = {
  [Direction.North]: 'n',
  [Direction.South]: 's',
  [Direction.East]: 'e',
  [Direction.West]: 'w',
};

/**
 * The animation name for a worker's state and facing, e.g. `walk_s` / `idle_n`.
 *
 * `Working` selects the six-frame `harvest` swing (07.7e). That animation
 * shipped with the phase-05.5 character set and was never selected by anything
 * — `Working` fell through to `idle`, so a worker tilling, planting, or
 * harvesting stood perfectly still for the whole of it. It is one motion for
 * all three tasks deliberately: the art is a generic work-the-ground swing,
 * and inventing a distinct pose per task would mean art that does not exist.
 *
 * It has no facing variants, so it is returned unsuffixed.
 */
export function selectAnimation(state: WorkerState, facing: Direction): string {
  if (state === WorkerState.Working) return 'harvest';
  const action = state === WorkerState.Moving ? 'walk' : 'idle';
  return `${action}_${DIRECTION_SUFFIX[facing]}`;
}

/**
 * Eases the last stretch of a step so a worker settles into a tile.
 *
 * The simulation moves a worker at a constant rate and MUST keep doing so —
 * this shapes only where the sprite is drawn between two snapshots, never when
 * it arrives (ADR-007 §5: interpolation never re-enters the sim). A linear
 * lerp reads as a slide; easing the tail reads as a step being placed.
 */
export function easedApproach(fraction: number): number {
  if (!Number.isFinite(fraction)) return 1;
  const t = Math.min(1, Math.max(0, fraction));
  // Ease-out-quad: full speed leaving the tile, settling into the next.
  return 1 - (1 - t) * (1 - t);
}

/**
 * Vertical breathing offset in pixels for an idle worker.
 *
 * UNBOUNDED MOTION (ADR-017 §2). A breathing worker never finishes breathing,
 * so this holds the frame loop open for as long as it is drawn — which is why
 * the caller gates it on the decorative-creatures setting and it is off by
 * default. The function itself is pure and always answers.
 *
 * Phase is DERIVED from the worker id so a row of workers does not breathe in
 * lockstep, and derived rather than rolled so the same farm breathes the same
 * way on every launch (ADR-017 §5).
 */
export function idleBob(tick: number, workerId: number, amplitude = 1): number {
  const phase = (workerId * 0.618_033_988) % 1;
  return Math.sin((tick / BREATH_TICKS + phase) * Math.PI * 2) * amplitude;
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

/**
 * The id of a worker on `tile`, or null. Matches the worker's current tile or
 * the one it is stepping onto, so a click just ahead of a moving worker still
 * selects it. First match wins (workers never share a tile — §4.4 claiming).
 */
export function workerAtTile(workers: readonly WorkerView[], tile: number): number | null {
  for (const worker of workers) {
    if (worker.tile === tile || worker.toTile === tile) return worker.id;
  }
  return null;
}
