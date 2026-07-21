/**
 * Command sources — the interaction layer. ADR-010 §6.
 *
 * A source PUSHES: it decides intent, builds a command, and submits it. Nothing
 * polls a source, and no source holds a buffer the simulation drains.
 *
 * This mirrors ADR-010 §3 exactly. There the input handler calls `dispatch`
 * during the frame and learns immediately whether the command was accepted;
 * only EXECUTION waits for the tick boundary. A pull model would defer
 * validation to the next poll, so the caller could not be told "rejected" at
 * the moment it acted — which is the feedback `GAME_DESIGN.md` §8.2 promises.
 *
 * PHASE-03.6 CORRECTION. Phase-03.5 defined these with a `take(): Command[]`
 * pull method, on the assumption that all four sources were symmetric. The
 * first real implementation — player input — showed they are not: the player
 * acts on events, not on ticks. Rather than bend the player to fit, the
 * abstraction was corrected. Worker AI, automation, and replay submit the same
 * way when they arrive; a tick-driven source simply submits from inside its
 * system.
 *
 * The four interfaces exist as a set because each fixes its own `source` tag.
 * A producer is bound to its identity at construction and cannot submit under
 * another — so "worker AI took a privileged path" is a compile error rather
 * than a review comment, and a replay's provenance stays honest.
 */

import type { Command, CommandResult, CommandSource } from './types';

/**
 * Anything that submits commands to the simulation.
 *
 * `submit` forwards to the world's `CommandDispatcher`, which stays the single
 * entry point for every write (ADR-010 §1). Implementations bind their own
 * source tag; they do not accept one per call.
 *
 * The returned `CommandResult` reports ACCEPTANCE, not execution: `ok` means
 * validated and queued. A command may still be rejected when it executes
 * (ADR-010 §3).
 */
export interface CommandProducer {
  readonly source: CommandSource;
  submit(command: Command): CommandResult;
}

/** Commands originating from direct player interaction. Phase-03.6. */
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
 * is the end that plays it back, submitting each command in recorded order.
 */
export interface ReplaySource extends CommandProducer {
  readonly source: typeof CommandSource.Replay;
}
