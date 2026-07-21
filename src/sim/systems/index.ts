/**
 * The ordered tick system list.
 *
 * ORDER IS DATA, declared here and nowhere else. It is never implied by
 * registration order or module discovery, because ordering carries correctness:
 * growth must run before harvest so a crop maturing this tick is harvestable
 * this tick, and snapshot must run last so views observe settled state.
 * ADR-007 §4.
 *
 * This is one of only two `index.ts` files permitted in the project, because it
 * is ordered data rather than a re-export barrel (PROJECT_STRUCTURE.md §8.4).
 *
 * PHASE-00 SCOPE: empty. Systems are added by phases 03-06, each inserted at a
 * deliberate position with any ordering dependency commented and tested.
 */

import type { World } from '../world/world';

import { snapshotSystem } from './snapshot';

/**
 * A system advances the world by exactly one tick.
 *
 * Systems take no delta time — the timestep is fixed (ADR-007 §1). Passing `dt`
 * into a system is a defect, not a style preference: it makes identical inputs
 * produce different results depending on frame timing, which destroys
 * determinism and with it save correctness.
 */
export type System = (world: World) => void;

export const TICK_SYSTEMS: readonly System[] = [
  // phase-03: intentSystem, growthSystem, harvestSystem
  // phase-04: workerSystem, movementSystem
  // phase-06: economySystem
  // phase-03: eventFlushSystem

  // MUST REMAIN LAST: views must observe fully settled state, never a
  // half-stepped world (ADR-007 §4). Insert new systems ABOVE this line.
  snapshotSystem,
];
