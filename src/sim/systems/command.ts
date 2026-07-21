/**
 * Drains the command queue. ADR-010 §3.
 *
 * MUST RUN FIRST, in `preUpdate`. A command dispatched during a frame applies
 * at the very start of the next tick, so every later system in that tick
 * observes its effect and the outcome does not depend on where in the frame the
 * call happened (ADR-007 §1).
 *
 * This is the system that makes `ARCHITECTURE.md` §4.1's tick-boundary flow
 * accurate rather than aspirational.
 */

import type { World } from '../world/world';

export function commandSystem(world: World): void {
  world.commands.drain();
}
