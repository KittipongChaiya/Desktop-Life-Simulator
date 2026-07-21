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
 * The counter increments BEFORE systems run, so `world.tick` and the tick a
 * system is computing are the same number. Ticks are therefore 1-based: after
 * N steps `world.tick === N`, and the Nth tick was computed while it read N.
 *
 * The alternative — incrementing afterwards — makes systems observe `N - 1`
 * while computing tick N, which is a permanent off-by-one that every future
 * system and every duration comparison has to remember. Not worth it.
 */
export function stepSimulation(world: World): void {
  world.tick += 1;

  for (const system of TICK_SYSTEMS) {
    system(world);
  }
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
