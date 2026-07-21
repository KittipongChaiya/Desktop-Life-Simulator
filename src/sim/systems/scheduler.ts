/**
 * Simulation scheduler. ADR-007 §4.
 *
 * ORDER IS DECLARED DATA, NEVER REGISTRATION ORDER.
 *
 * `PHASE_ORDER` below is the single authoritative statement of when things run.
 * Registering a system associates it with a *phase*; it does not decide where
 * that phase sits. This is the whole point: if execution order were the order
 * systems happened to register, it would become a function of import order,
 * bundler behaviour, and file names — and the determinism ADR-002, ADR-004, and
 * ADR-007 all depend on would be an accident rather than a guarantee.
 *
 * Within a phase, order is registration order, which is deterministic because
 * registration itself happens from one explicit list at startup.
 *
 * Validation runs at startup and FAILS FAST: an unknown phase or a duplicate
 * system name throws while the world is being built, not on some later tick.
 */

import type { World } from '../world/world';

/**
 * Execution phases, in the order they run.
 *
 * Adding a phase means editing this array — a deliberate, reviewable act.
 */
export const PHASE_ORDER = [
  /** Player intents are applied first, so an action lands on the tick it was issued. */
  'preUpdate',
  /** World-level state: time, weather (v0.2), tile decay. */
  'world',
  /** Crop growth and harvest. Phase-03. */
  'crops',
  /** Worker AI and movement. Phase-04. */
  'workers',
  /** Economy and inventory settlement. Phases 05-06. */
  'economy',
  /** Event dispatch and snapshot publication. Must run last. */
  'postUpdate',
] as const;

export type Phase = (typeof PHASE_ORDER)[number];

export type SystemFn = (world: World) => void;

export interface SystemRegistration {
  /** Unique name. Duplicates are rejected at registration. */
  readonly name: string;
  readonly phase: Phase;
  readonly run: SystemFn;
}

export interface SimulationScheduler {
  /** Registers a system into a declared phase. Throws on duplicate or bad phase. */
  register(registration: SystemRegistration): void;
  registerAll(registrations: readonly SystemRegistration[]): void;
  /** Runs every system once, in phase order. */
  step(world: World): void;
  /** System names in execution order. The testable statement of tick order. */
  order(): readonly string[];
  /** Systems registered to a phase, in order. */
  inPhase(phase: Phase): readonly string[];
  readonly size: number;
}

export function createScheduler(): SimulationScheduler {
  const byPhase = new Map<Phase, SystemRegistration[]>(PHASE_ORDER.map((p) => [p, []]));
  const names = new Set<string>();

  const register = (registration: SystemRegistration): void => {
    if (names.has(registration.name)) {
      throw new Error(`system "${registration.name}" is already registered`);
    }

    const bucket = byPhase.get(registration.phase);
    if (bucket === undefined) {
      throw new Error(
        `system "${registration.name}" declares unknown phase "${registration.phase}" — ` +
          `expected one of: ${PHASE_ORDER.join(', ')}`,
      );
    }

    names.add(registration.name);
    bucket.push(registration);
  };

  return {
    register,

    registerAll(registrations) {
      for (const registration of registrations) register(registration);
    },

    step(world) {
      // Iterating PHASE_ORDER rather than the map's keys keeps execution tied
      // to the declared array even if the map is ever rebuilt differently.
      for (const phase of PHASE_ORDER) {
        for (const system of byPhase.get(phase) ?? []) {
          system.run(world);
        }
      }
    },

    order() {
      return PHASE_ORDER.flatMap((phase) => (byPhase.get(phase) ?? []).map((s) => s.name));
    },

    inPhase: (phase) => (byPhase.get(phase) ?? []).map((s) => s.name),

    get size() {
      return names.size;
    },
  };
}
