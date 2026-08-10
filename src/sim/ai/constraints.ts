/**
 * The filter stage. Phase-14a — ADR-024 §1, §2.
 *
 * Work selection is three stages — discover, filter, select — and this is the
 * one that did not exist. Today's fixed bands collapse all three into one
 * function, which is exactly why they cannot express "where" or "when".
 *
 * ```
 *   discover                filter                    select
 * ┌──────────────┐     ┌───────────────┐        ┌────────────────┐
 * │ what work    │ ──► │ which of it   │ ─────► │ which one now  │
 * │ exists       │     │ THIS worker   │        │ (deterministic)│
 * └──────────────┘     │ may do NOW    │        └────────────────┘
 *                      └───────────────┘
 * ```
 *
 * ## Every scheduling concept is a constraint
 *
 * ADR-024 §2's table is the whole vocabulary: zones are a tile set,
 * permissions a task-kind set, shifts a phase set, roles a named bundle of
 * those, and an emergency override is a set that temporarily replaces the
 * active one. **A concept that cannot be expressed as a constraint or an
 * ordering input requires a successor ADR** — that bound is what makes
 * "extensible without redesign" checkable rather than aspirational.
 *
 * Constraints are **declared data**, evaluated by engine code that owns their
 * semantics. Same split as ADR-013 §4's price modifiers: the pipeline is
 * engine, each modifier is data, and it is what lets a content source ship a
 * role without shipping code.
 *
 * ## Priority is NOT here
 *
 * A priority reorders; it never excludes (ADR-024 §3). Keeping it out of this
 * stage prevents the most likely failure: a player who sends a task kind to
 * last should still see it done when nothing else remains, rather than see it
 * silently never done. Selection owns ordering; this file owns permission.
 */

import type { DayPhase } from '../time/game-clock';
import { UNCONSTRAINED, type WorkerSchedule, type WorkerTaskKind } from '../world/worker';

/** A worker with no schedule at all — every constraint absent. */
// Re-exported so callers reach the vocabulary and its neutral value through
// one module, while the dependency runs one way: constraints -> worker.
export { UNCONSTRAINED };
export type { WorkerSchedule };

/** The `(worker, task)` pair a constraint answers about. */
export interface WorkCandidate {
  readonly kind: WorkerTaskKind;
  readonly tile: number;
  /** The phase the world is in, for shift constraints. */
  readonly phase: DayPhase | undefined;
}

/** One constraint: a name, and one yes/no question. */
export interface WorkConstraint {
  readonly name: string;
  readonly allows: (schedule: WorkerSchedule, candidate: WorkCandidate) => boolean;
}

/**
 * The constraint set, in DECLARED evaluation order.
 *
 * ADR-024 §2 requires the order be declared once, in one place — the ADR-007
 * §4 rule one level down. Constraints are pure predicates so order cannot
 * change the outcome, but a declared order keeps short-circuiting
 * deterministic and keeps profiles comparable between runs.
 *
 * Cheapest first, so the common rejection costs least: a task kind check is a
 * short array scan, a zone check is a set lookup, a shift check needs the
 * calendar.
 */
export const WORK_CONSTRAINTS: readonly WorkConstraint[] = [
  {
    name: 'permission',
    allows: (schedule, candidate) =>
      schedule.taskKinds === undefined || schedule.taskKinds.includes(candidate.kind),
  },
  {
    name: 'zone',
    allows: (schedule, candidate) =>
      schedule.zone === undefined || schedule.zone.has(candidate.tile),
  },
  {
    name: 'shift',
    allows: (schedule, candidate) =>
      schedule.shift === undefined ||
      // A world with no phases cannot put anyone off shift. Returning false
      // here would idle every worker in a world whose content declared no
      // day phases, which is a worse answer than ignoring the constraint.
      candidate.phase === undefined ||
      schedule.shift.includes(candidate.phase),
  },
];

/**
 * Whether a worker may perform a task right now.
 *
 * Short-circuits on the first refusal, in declared order.
 */
export function allowsWork(schedule: WorkerSchedule, candidate: WorkCandidate): boolean {
  for (const constraint of WORK_CONSTRAINTS) {
    if (!constraint.allows(schedule, candidate)) return false;
  }
  return true;
}

/** The first constraint that refuses, or null. For typed rejections and tests. */
export function refusedBy(schedule: WorkerSchedule, candidate: WorkCandidate): string | null {
  for (const constraint of WORK_CONSTRAINTS) {
    if (!constraint.allows(schedule, candidate)) return constraint.name;
  }
  return null;
}

/**
 * Where a task kind sorts for this worker. Lower is sooner.
 *
 * Kinds the ordering does not mention sort AFTER the ones it does, rather than
 * before or being dropped — a partial priority list is a legal thing for a
 * player to express, and every kind stays reachable (ADR-024 §3).
 */
export function priorityOf(schedule: WorkerSchedule, kind: WorkerTaskKind): number {
  if (schedule.priority === undefined) return 0;
  const at = schedule.priority.indexOf(kind);
  return at === -1 ? schedule.priority.length : at;
}
