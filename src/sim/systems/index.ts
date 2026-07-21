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

import { eventFlushSystem, tickEventSystem } from './event-flush';
import type { SystemRegistration } from './scheduler';
import { snapshotSystem } from './snapshot';

export type { SystemFn as System } from './scheduler';

export const TICK_SYSTEMS: readonly SystemRegistration[] = [
  // phase-03: intentSystem (preUpdate), growthSystem + harvestSystem (crops)
  // phase-04: workerSystem + movementSystem (workers)
  // phase-06: economySystem (economy)

  { name: 'tickEvent', phase: 'postUpdate', run: tickEventSystem },
  { name: 'eventFlush', phase: 'postUpdate', run: eventFlushSystem },

  // MUST REMAIN LAST: views observe fully settled state, never a half-stepped
  // world (ADR-007 §4).
  { name: 'snapshot', phase: 'postUpdate', run: snapshotSystem },
];
