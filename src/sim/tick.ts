/**
 * The simulation step.
 *
 * Advances the world by exactly one fixed tick, running every system in
 * declared order. Deterministic: given the same world state, stepping produces
 * the same result every time.
 */

import { TICK_SYSTEMS } from './systems/index';
import type { World } from './world/world';

/**
 * Advances the world by one tick.
 *
 * Increments the tick counter AFTER systems run, so a system observing
 * `world.tick` sees the tick it is currently computing rather than the next one.
 */
export function stepSimulation(world: World): void {
  for (const system of TICK_SYSTEMS) {
    system(world);
  }
  world.tick += 1;
}

/** Advances the world by `count` ticks. Used by tests and offline catch-up. */
export function stepSimulationBy(world: World, count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`stepSimulationBy: count must be a non-negative integer, got ${count}`);
  }
  for (let i = 0; i < count; i += 1) {
    stepSimulation(world);
  }
}
