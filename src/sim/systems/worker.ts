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
import { selectStorageTarget } from '../ai/storage-target';
import { commandForTask, selectTask } from '../ai/worker-tasks';
import { CommandSource } from '../commands/types';
import { CORE_REST_HUT } from '../content/buildings';
import { findPath } from '../pathing/astar';
import { containerTotal } from '../world/container';
import {
  advanceEnergy,
  DEPOSIT_THRESHOLD,
  ENERGY_DRAIN_PER_PERIOD,
  ENERGY_RECOVER_PER_PERIOD,
  IDLE_REPLAN_TICKS,
  MAX_ENERGY,
  REST_HUT_RECOVER_PER_PERIOD,
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

/**
 * True when a rest hut stands. Its effect is global-while-placed (§5, 06c
 * interpretation 5) — workers rest where they stand at the boosted rate.
 */
function hasRestHut(world: World): boolean {
  for (const building of world.buildings.values()) {
    if (building.buildingId === CORE_REST_HUT) return true;
  }
  return false;
}

function recover(world: World, worker: Worker): void {
  const rate = hasRestHut(world) ? REST_HUT_RECOVER_PER_PERIOD : ENERGY_RECOVER_PER_PERIOD;
  const next = advanceEnergy(worker.energy, worker.energyTimer, rate);
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

  // Deposit a full-enough hold before doing more work (§4.4). The deposit is a
  // command like everything else (ADR-011); if the player inventory is full it
  // simply moves less, and the worker idles rather than jams (crit 14).
  if (containerTotal(worker.carrying) >= DEPOSIT_THRESHOLD) {
    // Ask the target-selection service where to deposit — a building id or null
    // for the player inventory. The worker never inspects a building's type
    // (ADR-011); the strategy behind this is replaceable.
    const storage = selectStorageTarget(world, worker.position);
    world.commands.dispatch(
      { type: 'depositWorker', worker: worker.id, storage },
      { source: CommandSource.Worker },
    );
    return;
  }

  // Waiting out a scheduled wait after a null scan (§4.2 — "wait"). Without
  // this cadence, sustained no-work (a dry seed stock, 06b) would have every
  // idle worker rescanning the whole farm each tick, burning the idle-CPU
  // budget the product stands on (PERFORMANCE.md).
  if (world.tick < worker.replanTick) return;

  const task = selectTask(world, worker.position, tilesClaimedByOthers(world, worker.id));
  if (task === null) {
    // No work — stay Idle and schedule the next scan (never jams, bounded
    // staleness of one second).
    worker.replanTick = world.tick + IDLE_REPLAN_TICKS;
    return;
  }

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

function stepWorking(world: World, worker: Worker): void {
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
    // Same dispatcher and validators as the player (ADR-010 §6); `actor` routes
    // a harvest's yield into THIS worker's hold (ADR-011 §5). A dispatch or
    // execution rejection (a full hold, a vanished crop) is handled by re-plan.
    world.commands.dispatch(commandForTask(worker.task), {
      source: CommandSource.Worker,
      actor: worker.id,
    });
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

function stepRest(world: World, worker: Worker): void {
  recover(world, worker);
  if (worker.energy >= MAX_ENERGY) worker.state = WorkerState.Idle;
}

export function workerSystem(world: World): void {
  for (const worker of workersInOrder(world)) {
    switch (worker.state) {
      case WorkerState.Idle:
        stepIdle(world, worker);
        break;
      case WorkerState.Moving:
        // Owned by `movementSystem`, which runs next in this phase.
        break;
      case WorkerState.Working:
        stepWorking(world, worker);
        break;
      case WorkerState.SeekingRest:
        stepSeekingRest(worker);
        break;
      case WorkerState.Rest:
        stepRest(world, worker);
        break;
    }
  }
}
