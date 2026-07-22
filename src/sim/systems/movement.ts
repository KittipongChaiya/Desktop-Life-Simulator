/**
 * Movement system. Phase-04b, GAME_DESIGN.md §4.3.
 *
 * Owns the `Moving` state. Runs in the `workers` phase, registered AFTER
 * `workerSystem` so a worker that decides to move this tick also takes its first
 * step this tick. It advances each moving worker one tick along its path at the
 * §4.3 timings, and holds two invariants the product depends on:
 *
 * - **Never jams.** If the grid changes so the next tile is impassable, it
 *   recomputes the route; if the goal is now unreachable, it abandons the task
 *   cleanly and returns the worker to `Idle` (§4.2).
 * - **The simulation is authoritative.** Interpolation between tiles is a
 *   render concern (ADR-007 §5); nothing here reads a rendered position.
 *
 * Mutation of worker hot state lives here (CODE_STYLE.md §2.2).
 */

import { enterCost, findPath, isWalkable } from '../pathing/astar';
import { advanceEnergy, ENERGY_DRAIN_PER_PERIOD, WorkerState, type Worker } from '../world/worker';
import type { World } from '../world/world';

/** Puts a worker at rest-seeking with its claim released — for a drained worker. */
function abandonToRest(worker: Worker): void {
  worker.task = null;
  worker.path = [];
  worker.pathCursor = 0;
  worker.actionProgress = 0;
  worker.state = WorkerState.SeekingRest;
}

/** Returns a worker to Idle with its claim released — for an unreachable goal. */
function abandonToIdle(worker: Worker): void {
  worker.task = null;
  worker.path = [];
  worker.pathCursor = 0;
  worker.actionProgress = 0;
  worker.state = WorkerState.Idle;
}

/** Marks arrival: the worker is on its goal tile and begins the action. */
function arrive(worker: Worker): void {
  worker.state = WorkerState.Working;
  worker.actionProgress = 0;
  worker.path = [];
  worker.pathCursor = 0;
}

function stepMovement(world: World, worker: Worker): void {
  if (worker.task === null) {
    worker.state = WorkerState.Idle;
    return;
  }

  // Already at the goal (including a zero-length same-tile "move").
  if (worker.path.length === 0 || worker.pathCursor >= worker.path.length - 1) {
    arrive(worker);
    return;
  }

  const energy = advanceEnergy(worker.energy, worker.energyTimer, -ENERGY_DRAIN_PER_PERIOD);
  worker.energy = energy.energy;
  worker.energyTimer = energy.timer;
  if (worker.energy <= 0) {
    abandonToRest(worker);
    return;
  }

  const nextTile = worker.path[worker.pathCursor + 1];
  if (nextTile === undefined) {
    arrive(worker);
    return;
  }

  // The grid may have changed beneath the worker (a building placed on the
  // route, later). Recompute from where it stands; give up only if truly sealed.
  if (!isWalkable(world, nextTile)) {
    const repath = findPath(world, worker.position, worker.task.tile);
    if (!repath.ok) {
      abandonToIdle(worker);
      return;
    }
    worker.path = repath.value;
    worker.pathCursor = 0;
    worker.actionProgress = 0;
    return;
  }

  worker.actionProgress += 1;
  if (worker.actionProgress >= enterCost(world, nextTile)) {
    worker.position = nextTile;
    worker.pathCursor += 1;
    worker.actionProgress = 0;
    if (worker.pathCursor >= worker.path.length - 1) arrive(worker);
  }
}

export function movementSystem(world: World): void {
  for (const worker of [...world.workers.values()].sort((a, b) => a.id - b.id)) {
    if (worker.state === WorkerState.Moving) stepMovement(world, worker);
  }
}
