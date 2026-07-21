/**
 * Publishes the per-tick event and drains the queue.
 *
 * Two systems, both in `postUpdate`, in this order:
 *   tickEventSystem  — states the fact that a tick completed
 *   eventFlushSystem — dispatches everything published during the tick
 *
 * Flushing here rather than at publish time is what makes subscribers safe:
 * every system has finished mutating before any subscriber observes anything
 * (ARCHITECTURE.md §3.5).
 */

import type { World } from '../world/world';

/** Announces the completed tick. The bus's first real producer. */
export function tickEventSystem(world: World): void {
  world.events.publish('simulationTick', { tick: world.tick });
}

/** Dispatches every event queued during this tick. */
export function eventFlushSystem(world: World): void {
  world.events.flush();
}
