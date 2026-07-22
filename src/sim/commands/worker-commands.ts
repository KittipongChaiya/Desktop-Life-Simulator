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
import { toIndexUnchecked } from '../../shared/geometry';
import { ok } from '../../shared/result';
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

/** Registers the worker commands into a dispatcher. */
export function registerWorkerCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('hireWorker', {
    validate: () => ok(),
    execute: (context) => hireWorker(context.world),
  });
}
