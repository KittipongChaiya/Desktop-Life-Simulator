/**
 * Command sources — the interaction layer. ADR-010 §6.
 *
 * INTERFACES ONLY. The player UI (phase-05), worker AI (phase-04), automation
 * (phase-06), and replay (post-v1.0) each implement one of these when they
 * arrive. Nothing here is implemented now, and nothing here is a stub: these
 * are contracts, not placeholders (`AI_RULES.md` §1.6).
 *
 * They exist as a set rather than one interface because the distinction they
 * encode is the entire point of ADR-010 §6: a producer declares WHICH source it
 * is, and cannot claim to be another. `WorkerCommandSource` cannot report
 * itself as the player, so "worker AI took a privileged shortcut" becomes a
 * compile error rather than a review comment — and a replay's provenance stays
 * honest.
 *
 * What every source shares, and what makes replay possible at all: they all
 * produce the SAME `Command` values and dispatch them through the SAME
 * dispatcher. There is no privileged variant, no "internal callers only" API.
 */

import type { Command, CommandSource } from './types';

/**
 * Anything that produces commands for the simulation.
 *
 * `take` must be PURE with respect to world state — a producer reads the world
 * and returns what it wants to happen; it never applies anything itself. That
 * is the dispatcher's job, and keeping it so is what ADR-010 §1 protects.
 */
export interface CommandProducer {
  readonly source: CommandSource;
  /** Commands produced since the last call, in the order they should apply. */
  take(): readonly Command[];
}

/** Commands originating from direct player interaction. Phase-05. */
export interface PlayerInputSource extends CommandProducer {
  readonly source: typeof CommandSource.Player;
}

/**
 * Commands issued by worker AI. Phase-04.
 *
 * Deliberately identical in kind to `PlayerInputSource`. If this interface ever
 * grows a member the others lack, that is the architecture rotting (ADR-010 §6).
 */
export interface WorkerCommandSource extends CommandProducer {
  readonly source: typeof CommandSource.Worker;
}

/** Commands issued by unattended automation — seed bin, market stall. Phase-06. */
export interface AutomationSource extends CommandProducer {
  readonly source: typeof CommandSource.Automation;
}

/**
 * Commands re-applied from a recorded stream. Post-v1.0.
 *
 * `seed + ordered command stream` is the whole replay format (ADR-010 §5); this
 * is the end that plays it back.
 */
export interface ReplaySource extends CommandProducer {
  readonly source: typeof CommandSource.Replay;
}
