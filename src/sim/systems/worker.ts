/**
 * Worker system — the FSM driver. Phase-04, GAME_DESIGN.md §4.
 *
 * Runs in the `workers` phase, after `commandSystem` has drained the previous
 * frame's commands. For each worker, in ascending id order (deterministic), it
 * advances one state-machine step. The ONE hard rule (§4.2): a worker never
 * deadlocks — with no task it returns to `Idle` and waits, and `Idle` is
 * reachable from every state.
 *
 * All mutation of worker hot state lives here (CODE_STYLE.md §2.2); decisions are
 * delegated to pure helpers in `src/sim/ai/`. Actions leave only as commands
 * through the dispatcher — a worker has no privileged write path (ADR-010 §6).
 */

import type { TileIndex, WorkerId } from '../../shared/ids';
import { commandForTask, selectTask } from '../ai/worker-tasks';
import { type Command, CommandSource } from '../commands/types';
import { findPath } from '../pathing/astar';
import {
  advanceEnergy,
  ENERGY_DRAIN_PER_PERIOD,
  ENERGY_RECOVER_PER_PERIOD,
  MAX_ENERGY,
  TASK_DURATION_TICKS,
  WorkerState,
  type Worker,
} from '../world/worker';
import type { World } from '../world/world';

/** Workers in ascending id order — the deterministic processing order. */
function workersInOrder(world: World): readonly Worker[] {
  return [...world.workers.values()].sort((a, b) => a.id - b.id);
}

/** Tiles some OTHER worker has claimed. Recomputed per worker so a claim made
 * earlier this tick is visible to workers processed later — guaranteeing two
 * workers never target the same tile (§4.4). */
function tilesClaimedByOthers(world: World, selfId: WorkerId): ReadonlySet<TileIndex> {
  const claimed = new Set<TileIndex>();
  for (const worker of world.workers.values()) {
    if (worker.id !== selfId && worker.task !== null) claimed.add(worker.task.tile);
  }
  return claimed;
}

function drain(worker: Worker): void {
  const next = advanceEnergy(worker.energy, worker.energyTimer, -ENERGY_DRAIN_PER_PERIOD);
  worker.energy = next.energy;
  worker.energyTimer = next.timer;
}

function recover(worker: Worker): void {
  const next = advanceEnergy(worker.energy, worker.energyTimer, ENERGY_RECOVER_PER_PERIOD);
  worker.energy = next.energy;
  worker.energyTimer = next.timer;
}

function stepIdle(world: World, worker: Worker): void {
  // Release any task retained through the previous action's submission, so the
  // claim is freed before re-planning.
  worker.task = null;

  if (worker.energy <= 0) {
    worker.state = WorkerState.SeekingRest;
    return;
  }

  const task = selectTask(world, worker.position, tilesClaimedByOthers(world, worker.id));
  if (task === null) return; // no work — stay Idle and wait (never jams)

  const path = findPath(world, worker.position, task.tile);
  if (!path.ok) return; // target unreachable right now — stay Idle and retry

  worker.task = task;
  worker.path = path.value;
  worker.pathCursor = 0;
  worker.actionProgress = 0;
  worker.state = WorkerState.Moving;
  // `movementSystem`, registered next in this phase, takes the first step this
  // same tick — and promotes a zero-length (already-on-target) move straight to
  // Working, so deciding to work costs no wasted tick.
}

function stepWorking(worker: Worker, submit: (command: Command) => void): void {
  if (worker.task === null) {
    worker.state = WorkerState.Idle;
    return;
  }

  drain(worker);
  if (worker.energy <= 0) {
    // Abandon the unfinished action and rest. Nothing was committed, so no
    // value is destroyed (§4.5). The claim is released for other workers.
    worker.task = null;
    worker.actionProgress = 0;
    worker.state = WorkerState.SeekingRest;
    return;
  }

  worker.actionProgress += 1;
  if (worker.actionProgress >= TASK_DURATION_TICKS[worker.task.kind]) {
    submit(commandForTask(worker.task));
    worker.actionProgress = 0;
    // Retain `task` so the tile stays claimed until this worker re-plans next
    // tick, by which point the command has executed and the target changed.
    worker.state = WorkerState.Idle;
  }
}

function stepSeekingRest(worker: Worker): void {
  // No Rest Hut exists in v0.1, so a worker rests where it stands (§4.5).
  worker.state = WorkerState.Rest;
}

function stepRest(worker: Worker): void {
  recover(worker);
  if (worker.energy >= MAX_ENERGY) worker.state = WorkerState.Idle;
}

export function workerSystem(world: World): void {
  const submit = (command: Command): void => {
    // Same dispatcher, same validators as the player. A rejection at dispatch
    // (target already changed) simply means nothing queues; the worker re-plans
    // next tick. Execution-time rejections surface via `onExecutionRejected`.
    world.commands.dispatch(command, { source: CommandSource.Worker });
  };

  for (const worker of workersInOrder(world)) {
    switch (worker.state) {
      case WorkerState.Idle:
        stepIdle(world, worker);
        break;
      case WorkerState.Moving:
        // Owned by `movementSystem`, which runs next in this phase.
        break;
      case WorkerState.Working:
        stepWorking(worker, submit);
        break;
      case WorkerState.SeekingRest:
        stepSeekingRest(worker);
        break;
      case WorkerState.Rest:
        stepRest(worker);
        break;
    }
  }
}
