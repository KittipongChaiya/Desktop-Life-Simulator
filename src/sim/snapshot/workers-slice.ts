/**
 * Worker snapshot projection. Phase-04c (view layer), ADR-005 §2.
 *
 * The sim→view boundary for workers. `projectWorkers` reads the world and
 * returns PLAIN, IMMUTABLE presentation data — every field a primitive or a
 * freshly-built object, so no reference into a mutable simulation store escapes
 * to the renderer. The renderer consumes only these types; it never touches a
 * `Worker`, a `World`, or any sim object (ARCHITECTURE.md §2, ADR-004 §6).
 *
 * It is pure and deterministic: identical world state yields an identical
 * projection, which is what lets `publishIfChanged` (state.ts) republish the
 * slice only when the view actually changes.
 *
 * `moveFraction` and `facing` are DERIVED here rather than stored on the worker
 * — they are presentation concerns, not simulation state, so the `Worker` record
 * (ADR-004 §1) stays free of them.
 */

import { toPosition } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import type { RoleRegistry } from '../content/roles';
import type { TileKindRegistry } from '../content/tile-kinds';
import { enterCost } from '../pathing/astar';
import type { TileGrid } from '../world/tile-grid';
import {
  WorkerState,
  type Worker,
  type WorkerSchedule,
  type WorkerStore,
  type WorkerTaskKind,
} from '../world/worker';

/** Which way a worker sprite faces. Presentation only. */
export const Direction = {
  North: 'north',
  East: 'east',
  South: 'south',
  West: 'west',
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

/** One worker, projected for rendering and selection UI. Plain, immutable data. */
export interface WorkerView {
  readonly id: number;
  /** Current tile. */
  readonly tile: number;
  /** Tile being entered while moving; equal to `tile` when stationary. */
  readonly toTile: number;
  /** Progress 0–1 from `tile` to `toTile`; 0 when not moving. For interpolation. */
  readonly moveFraction: number;
  /** Facing derived from the current step; a camera-facing default when still. */
  readonly facing: Direction;
  readonly state: WorkerState;
  /** A fresh copy of the current task, or null. Never the sim's own object. */
  readonly task: { readonly kind: WorkerTaskKind; readonly tile: number } | null;
  readonly energy: number;
  /**
   * The role this worker's schedule matches, or null for a bespoke one.
   *
   * A role ID rather than the schedule itself: the panel needs to name what a
   * worker is set to, and projecting the constraint sets would put simulation
   * shapes into a view nothing reads (ADR-005 §2). A player who edits a zone
   * onto a role gets `null` here, which is honest — they are no longer on it.
   */
  readonly role: string | null;
}

/** The world state the projection reads. `World` satisfies this structurally. */
export interface WorkerProjectionSource {
  /** Registered roles, so a schedule can be named rather than described. */
  readonly roleRegistry: RoleRegistry;
  readonly workers: WorkerStore;
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
}

/** Facing from `from` to an orthogonally-adjacent `to`. */
function directionBetween(from: TileIndex, to: TileIndex): Direction {
  const a = unwrap(toPosition(from));
  const b = unwrap(toPosition(to));
  if (b.y < a.y) return Direction.North;
  if (b.y > a.y) return Direction.South;
  if (b.x > a.x) return Direction.East;
  return Direction.West;
}

function projectWorker(source: WorkerProjectionSource, worker: Worker): WorkerView {
  const nextTile = worker.path[worker.pathCursor + 1];
  const moving = worker.state === WorkerState.Moving && nextTile !== undefined;

  const toTile = moving ? nextTile : worker.position;
  const moveFraction = moving ? worker.actionProgress / enterCost(source, toTile) : 0;
  const facing = moving ? directionBetween(worker.position, toTile) : Direction.South;

  return {
    id: worker.id,
    tile: worker.position,
    toTile,
    moveFraction,
    facing,
    state: worker.state,
    task: worker.task === null ? null : { kind: worker.task.kind, tile: worker.task.tile },
    energy: worker.energy,
    role: roleMatching(source.roleRegistry, worker.schedule),
  };
}

/** Every worker, projected and ordered by id (deterministic). */

/**
 * The role a schedule matches, or null.
 *
 * Compared by VALUE over the three fields a role can express — a role sets
 * exactly those, so a schedule that differs in any of them is not on that role
 * however it got there. The zone is ignored, because a role cannot express one
 * and a worker with a zone is still on their role.
 */
function roleMatching(registry: RoleRegistry, schedule: WorkerSchedule): string | null {
  const same = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean =>
    a === undefined || b === undefined
      ? a === b
      : a.length === b.length && a.every((value, index) => value === b[index]);

  for (const role of registry.all()) {
    if (
      same(schedule.taskKinds, role.taskKinds) &&
      same(schedule.shift, role.shift) &&
      same(schedule.priority, role.priority)
    ) {
      return role.id;
    }
  }
  return null;
}

export function projectWorkers(source: WorkerProjectionSource): readonly WorkerView[] {
  return [...source.workers.values()]
    .sort((a, b) => a.id - b.id)
    .map((worker) => projectWorker(source, worker));
}

/** Change test for the workers slice — element-wise, so it republishes only on a real change. */
export function workersEqual(a: readonly WorkerView[], b: readonly WorkerView[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return false;
    if (
      x.id !== y.id ||
      x.tile !== y.tile ||
      x.toTile !== y.toTile ||
      x.moveFraction !== y.moveFraction ||
      x.facing !== y.facing ||
      x.state !== y.state ||
      x.energy !== y.energy
    ) {
      return false;
    }
    if ((x.task === null) !== (y.task === null)) return false;
    if (
      x.task !== null &&
      y.task !== null &&
      (x.task.kind !== y.task.kind || x.task.tile !== y.task.tile)
    ) {
      return false;
    }
  }
  return true;
}
