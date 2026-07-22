/**
 * Worker entities. Phase-04, ADR-004 §1.
 *
 * A worker is a plain typed record in an id-keyed sparse store — no methods, no
 * base class. Behaviour lives in systems (`src/sim/systems/worker.ts`), decisions
 * in pure helpers (`src/sim/ai/`). This keeps a worker trivially serializable and
 * keeps "everything that touches energy" answerable by grep (ADR-004 §1).
 *
 * `position` is a `TileIndex`, not an `x/y` pair: every spatial reference in the
 * simulation is a tile index (crops keyed by tile, tasks target tiles, A* runs
 * over indices), so one representation avoids scattered coordinate↔index
 * conversions. The renderer derives `x/y` for interpolation at the view boundary.
 */

import type { TileIndex, WorkerId } from '../../shared/ids';

import { createContainer, type Container } from './container';

/**
 * The five worker states. `GAME_DESIGN.md` §4.2.
 *
 * A worker NEVER deadlocks: with no task it returns to `Idle` and waits, and no
 * state can leave `Idle` unreachable (`VISION.md` §2.2, a hard product rule).
 */
export const WorkerState = {
  Idle: 'idle',
  Moving: 'moving',
  Working: 'working',
  SeekingRest: 'seekingRest',
  Rest: 'rest',
} as const;

export type WorkerState = (typeof WorkerState)[keyof typeof WorkerState];

/**
 * The kinds of work a worker performs in v0.1.
 *
 * Water and deposit from `GAME_DESIGN.md` §4.4 are deliberately absent: no water
 * command exists (phase-03.6 left the can tool unbound), and deposit needs the
 * inventory and storage buildings that arrive in phase-05. Adding either now
 * would invent a destination that does not exist (`AI_RULES.md` §1.5).
 */
export const WorkerTaskKind = {
  Harvest: 'harvest',
  Plant: 'plant',
  Till: 'till',
} as const;

export type WorkerTaskKind = (typeof WorkerTaskKind)[keyof typeof WorkerTaskKind];

/** A claimed unit of work: a kind and the tile it targets. */
export interface WorkerTask {
  readonly kind: WorkerTaskKind;
  readonly tile: TileIndex;
}

export interface Worker {
  readonly id: WorkerId;
  /** The tile the worker occupies. Mutable sim hot state (CODE_STYLE.md §2.2). */
  position: TileIndex;
  state: WorkerState;
  /** The claimed task, or null when idle. A tile is claimed iff some worker targets it. */
  task: WorkerTask | null;
  /** Route to the current task's tile. Empty until phase-04b wires pathfinding. */
  path: readonly TileIndex[];
  /** How far along `path` the worker has walked. */
  pathCursor: number;
  /** Ticks accumulated toward the current action's duration. */
  actionProgress: number;
  /** 0–100. Throttles, never fails (§4.5). */
  energy: number;
  /**
   * Sub-period accumulator for the "per 20 ticks" energy rates (§4.5).
   *
   * Energy is an integer (floats would drift and break determinism, ADR-007),
   * so it cannot change by a fraction each tick. This counts ticks within a
   * period; energy moves by the whole-number amount when the period completes.
   */
  energyTimer: number;
  /**
   * Items the worker is carrying — a container capped at 20 items (§4.6,
   * ADR-011). A worker harvests into it and, at ≥ 10, deposits it to storage or
   * the player inventory.
   */
  carrying: Container;
}

/** Sparse store keyed by branded id (ADR-004 §2). */
export type WorkerStore = Map<WorkerId, Worker>;

export function createWorkerStore(): WorkerStore {
  return new Map();
}

/** Maximum energy. `GAME_DESIGN.md` §4.5. */
export const MAX_ENERGY = 100;

/** Items a worker carries before it must deposit. `GAME_DESIGN.md` §4.6. */
export const WORKER_CARRY_CAPACITY = 20;

/** The worker deposits once its hold reaches this many items. `GAME_DESIGN.md` §4.4. */
export const DEPOSIT_THRESHOLD = 10;

/** The period over which energy rates are expressed. §4.5 ("per 20 ticks"). */
export const ENERGY_PERIOD_TICKS = 20;

/** Energy lost per period while `Working` or `Moving`. §4.5. */
export const ENERGY_DRAIN_PER_PERIOD = 1;

/** Energy recovered per period while `Rest` (base rate, no Rest Hut in v0.1). §4.5. */
export const ENERGY_RECOVER_PER_PERIOD = 2;

/** Ticks each action takes. `GAME_DESIGN.md` §4.3. */
export const TASK_DURATION_TICKS: Readonly<Record<WorkerTaskKind, number>> = {
  [WorkerTaskKind.Harvest]: 30,
  [WorkerTaskKind.Plant]: 20,
  [WorkerTaskKind.Till]: 30,
};

/** Ticks to cross one tile at `moveCost` 1. §4.3 (10 ticks = 0.5 s). */
export const MOVE_TICKS_BASE = 10;

/**
 * Ticks to enter a tile of the given movement cost.
 *
 * Ties the §4.3 timing to the tile-kind `moveCost` field so pathfinding and
 * movement read the same number (ADR: "pathfinding reads this rather than
 * special-casing kinds"). Grass (cost 1) → 10 ticks; `core:path` (cost 0.7) →
 * 7 ticks, the 1.5× speed of §2.2. Rounded to an integer so movement stays on
 * tick boundaries — no float drift in the simulation (ADR-007). Floored to 1 so
 * no tile is free to cross.
 */
export function moveTicksForCost(moveCost: number): number {
  return Math.max(1, Math.round(MOVE_TICKS_BASE * moveCost));
}

/**
 * Advances energy by one tick toward a per-period rate.
 *
 * PURE. Energy is an integer (floats would drift and break determinism,
 * ADR-007), so it cannot change fractionally each tick. `timer` counts ticks
 * within a period; when the period completes, energy moves by `deltaPerPeriod`
 * (negative to drain, positive to recover) and clamps to `[0, MAX_ENERGY]`.
 */
export function advanceEnergy(
  energy: number,
  timer: number,
  deltaPerPeriod: number,
): { readonly energy: number; readonly timer: number } {
  const nextTimer = timer + 1;
  if (nextTimer < ENERGY_PERIOD_TICKS) return { energy, timer: nextTimer };
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy + deltaPerPeriod));
  return { energy: clamped, timer: 0 };
}

/**
 * A fresh worker: idle, full energy, at `position`.
 *
 * Full energy so a first hire produces the "oh, I see" moment immediately
 * (`VISION.md` §6.3) rather than trudging off to rest.
 */
export function createWorker(id: WorkerId, position: TileIndex): Worker {
  return {
    id,
    position,
    state: WorkerState.Idle,
    task: null,
    path: [],
    pathCursor: 0,
    actionProgress: 0,
    energy: MAX_ENERGY,
    energyTimer: 0,
    carrying: createContainer(WORKER_CARRY_CAPACITY, WORKER_CARRY_CAPACITY),
  };
}
