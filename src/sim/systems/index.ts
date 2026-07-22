/**
 * The declared tick schedule.
 *
 * ORDER IS DATA. This array is the single authoritative statement of when
 * systems run; the scheduler associates each with a PHASE and never infers
 * order from registration, import order, or discovery (ADR-007 §4).
 *
 * This is one of only two `index.ts` files permitted in the project, because it
 * is ordered data rather than a re-export barrel (PROJECT_STRUCTURE.md §8.4).
 */

import { commandSystem } from './command';
import { eventFlushSystem, tickEventSystem } from './event-flush';
import type { SystemRegistration } from './scheduler';
import { snapshotSystem } from './snapshot';
import { workerSystem } from './worker';

export type { SystemFn as System } from './scheduler';

export const TICK_SYSTEMS: readonly SystemRegistration[] = [
  // MUST REMAIN FIRST: a command dispatched during the previous frame applies
  // before any system reads the world, so an action lands on the tick it was
  // issued for (ADR-010 §3).
  { name: 'command', phase: 'preUpdate', run: commandSystem },

  // Crop growth needs no system: maturity is derived from `tick - plantedTick`
  // (ADR-009 §2), never stored, so there is nothing to advance each tick.

  // Worker AI decides, claims, works, and rests. `movementSystem` joins it in
  // the same phase in phase-04b, registered after it so a worker's decision
  // this tick is acted on the same tick.
  { name: 'worker', phase: 'workers', run: workerSystem },

  // phase-06: economySystem (economy)

  { name: 'tickEvent', phase: 'postUpdate', run: tickEventSystem },
  { name: 'eventFlush', phase: 'postUpdate', run: eventFlushSystem },

  // MUST REMAIN LAST: views observe fully settled state, never a half-stepped
  // world (ADR-007 §4).
  { name: 'snapshot', phase: 'postUpdate', run: snapshotSystem },
];
