/**
 * Worker commands. Phase-04, GAME_DESIGN.md §4.1.
 *
 * `hireWorker` is the only worker command a PLAYER issues — the worker's own
 * actions (till, plant, harvest) reuse the crop commands, submitted worker-
 * sourced through the same dispatcher (ADR-010 §6). Hiring spawns a worker at
 * the plot centre with a fresh deterministic id.
 *
 * Cost is computed but not charged: there is no wallet until phase-06, so hiring
 * always succeeds in v0.1 (`AI_RULES.md` §1.5). The escalation formula is fixed
 * now so the economy that arrives later has a stable number to bill against.
 *
 * No `workerHired` event yet: `events/types.ts` forbids an event with no
 * consumer, and its consumer (the HUD count) arrives in phase-04c.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { appError, ErrorCode } from '../../shared/errors';
import { toIndexUnchecked } from '../../shared/geometry';
import { asBuildingId, asWorkerId } from '../../shared/ids';
import { err, ok } from '../../shared/result';
import { stackSizeOf } from '../content/items';
import { transfer, type Container } from '../world/container';
import { createWorker } from '../world/worker';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/** Base cost of the first worker. §4.1. */
const BASE_HIRE_COST = 150;

/** Per-worker cost multiplier. §4.1. */
const HIRE_COST_GROWTH = 1.6;

/**
 * Cost to hire the next worker given how many already exist.
 *
 * `hireCost(0)` is the first worker (150). Exponential against linear
 * throughput is what keeps each hire a meaningful target (§4.1).
 */
export function hireCost(existingCount: number): number {
  return Math.floor(BASE_HIRE_COST * HIRE_COST_GROWTH ** existingCount);
}

/** The tile a new worker spawns on — the world centre, inside the owned plot. */
function plotCentre(): ReturnType<typeof toIndexUnchecked> {
  return toIndexUnchecked(WORLD_WIDTH >> 1, WORLD_HEIGHT >> 1);
}

/** Spawns a worker. Always valid in v0.1 — affordability arrives with the wallet. */
export function hireWorker(world: CommandWorld): ValidationResult {
  const id = world.ids.allocateWorker();
  world.workers.set(id, createWorker(id, plotCentre()));
  return ok();
}

/**
 * Empties a worker's hold into the player inventory, transfer by transfer
 * (ADR-011 §3). Whatever does not fit stays in the hold — a full inventory
 * blocks the deposit, it never discards (§7). In phase-06 the destination
 * becomes the nearest storage shed.
 */
/**
 * The container a deposit targets: a storage building's, or — for `null`, or a
 * building that has since vanished — the player inventory (ADR-011). Workers ask
 * a target-selection service for the id; this resolves it to a live container.
 */
function resolveStorage(world: CommandWorld, storage: number | null): Container {
  if (storage === null) return world.inventory;
  return world.buildingStorage.get(asBuildingId(storage)) ?? world.inventory;
}

export function depositWorker(
  world: CommandWorld,
  workerRaw: number,
  storage: number | null,
): ValidationResult {
  const worker = world.workers.get(asWorkerId(workerRaw));
  if (worker === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker: workerRaw }));
  }

  const destination = resolveStorage(world, storage);
  // Iterate a snapshot of the stacks: `transfer` mutates the hold as it drains.
  // Whatever does not fit stays in the hold (conserved; a full target blocks).
  for (const stack of [...worker.carrying.stacks]) {
    transfer(
      worker.carrying,
      destination,
      stack.item,
      stack.quantity,
      stackSizeOf(world.itemRegistry, stack.item),
    );
  }
  return ok();
}

/** Registers the worker commands into a dispatcher. */
export function registerWorkerCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('hireWorker', {
    validate: () => ok(),
    execute: (context) => hireWorker(context.world),
  });

  dispatcher.register('depositWorker', {
    validate: () => ok(),
    execute: (context, command) => depositWorker(context.world, command.worker, command.storage),
  });
}
