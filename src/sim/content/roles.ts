/**
 * Roles. Phase-14c — ADR-024 §2, ADR-019 §3.
 *
 * A role is *"a named, reusable constraint bundle"* — content data, so a source
 * can ship one without shipping code. It is the fourth row of ADR-024 §2's
 * table and it needed no new mechanism at all: a role IS a schedule, named.
 *
 * ## What a role may and may not carry
 *
 * Task kinds, a shift, and a priority ordering — all of which are vocabulary,
 * meaningful in any world.
 *
 * **A zone is deliberately absent.** A zone is a set of tile indices, and tile
 * indices are facts about one particular farm; a role shipped by a content
 * source cannot know them, and one that named them would be wrong on every
 * world but the author's. Zones stay per-worker, set by the player through a
 * command. That is the same line ADR-004 §5 draws for content generally:
 * definitions describe kinds, instances carry the specifics.
 *
 * ## An unsatisfiable role is refused at registration
 *
 * `ROADMAP.md` §10 makes this an acceptance: a constraint set that can never
 * permit any work must not reach a worker. Caught here, at registration, where
 * the author gets told — rather than at selection, where it looks to a player
 * like a worker that mysteriously stopped.
 */

import { asContentId, type ContentId } from '../../shared/ids';
import type { DayPhase } from '../time/game-clock';
import type { WorkerTaskKind } from '../world/worker';

import { createContentRegistry, type ContentRegistry } from './registry';

export interface RoleDefinition {
  readonly id: ContentId;
  /** What a player reads. Presentation only — no rule may branch on it. */
  readonly displayName: string;
  /** Task kinds this role permits. Absent means all of them. */
  readonly taskKinds?: readonly WorkerTaskKind[];
  /** Phases this role is on shift. Absent means always. */
  readonly shift?: readonly DayPhase[];
  /** Preferred task order. An ordering input, never a filter (ADR-024 §3). */
  readonly priority?: readonly WorkerTaskKind[];
}

export const CORE_FARMHAND = asContentId('core:farmhand');
export const CORE_HARVESTER = asContentId('core:harvester');
export const CORE_GROUNDSKEEPER = asContentId('core:groundskeeper');
/** The wilds crew (phase-27). Gathering is opt-in and this role is the opt. */
export const CORE_FORAGER = asContentId('core:forager');

export type RoleRegistry = ContentRegistry<RoleDefinition>;

export function createRoleRegistry(): RoleRegistry {
  return createContentRegistry<RoleDefinition>('role');
}

/**
 * Whether a role could ever permit any work.
 *
 * An EMPTY list is the unsatisfiable case, and it is not the same as an absent
 * one: absent means unconstrained, empty means permitted nothing. A role whose
 * task kinds or shift is empty can never allow a single task, on any farm, at
 * any hour — so it is refused rather than registered and discovered later.
 */
export function isSatisfiableRole(role: RoleDefinition): boolean {
  if (role.taskKinds !== undefined && role.taskKinds.length === 0) return false;
  if (role.shift !== undefined && role.shift.length === 0) return false;
  return true;
}
