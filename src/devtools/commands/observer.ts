/**
 * Command monitor — the observation. Phase-07.8f, ADR-018 §2/§3.
 *
 * OBSERVING A COMMAND MUST NOT CHANGE IT. The wrapper returns exactly the
 * result the producer returned — the same object, not a copy — and rethrows
 * exactly what it threw. It adds no validation, no retry, no filtering, and no
 * second path into the dispatcher: a debug build must dispatch commands
 * identically to a release one, or a bug reproduced with the tools open is not
 * a reproduction.
 *
 * WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED. This wraps a command
 * PRODUCER, which is renderer-side, so it observes what the player submits.
 * Worker commands are dispatched inside the simulation and pass no boundary the
 * renderer can wrap. Execution is likewise invisible: it happens a tick later,
 * inside `drain`, and the only seam out of it is the dispatcher's existing
 * `onExecutionRejected` — which is why failures are observed through that hook
 * and successes are not observed at all. Adding a seam for them would be a
 * simulation change made for a debug tool, which ADR-018 §1 refuses and this
 * phase's hard constraint forbids outright.
 */

import type { AppError } from '../../shared/errors';
import type {
  Command,
  CommandMetadata,
  CommandResult,
  CommandSource,
} from '../../sim/commands/types';

import { CommandOutcome, type CommandSink } from './ring';

/** Anything that submits commands. Matches `CommandProducer` structurally. */
export interface ObservableProducer {
  readonly source: CommandSource;
  submit(command: Command): CommandResult;
}

export interface ObservationReaders {
  readonly tick: () => number;
  /** Commands queued right now. */
  readonly pending: () => number;
  /** Injected so tests are not at the mercy of a real clock. */
  readonly now?: () => number;
}

function clockOf(readers: ObservationReaders): () => number {
  // Real time, deliberately: measuring a dispatch in ticks would report zero
  // for everything. ADR-018 §8 permits debug tooling to read real time; what it
  // forbids is that reading re-entering the simulation, and this only records.
  return readers.now ?? ((): number => performance.now());
}

/**
 * Wraps a command producer so every submission is observed.
 *
 * Returns a new producer; the original is untouched, so nothing that already
 * holds it changes behaviour.
 */
export function observeCommands<T extends ObservableProducer>(
  producer: T,
  sink: CommandSink,
  readers: ObservationReaders,
): T {
  const now = clockOf(readers);

  return {
    ...producer,
    submit(command: Command): CommandResult {
      const started = now();

      let result: CommandResult;
      try {
        result = producer.submit(command);
      } catch (error) {
        // Never swallowed (AI_RULES.md §2.2). Recorded first, because a
        // command that threw is the one most worth having in the ring.
        sink.record({
          tick: readers.tick(),
          type: command.type,
          source: producer.source,
          outcome: CommandOutcome.Failed,
          detail: error instanceof Error ? error.message : String(error),
          dispatchMs: now() - started,
          queueDepth: readers.pending(),
        });
        throw error;
      }

      sink.record({
        tick: readers.tick(),
        type: command.type,
        source: producer.source,
        outcome: result.ok ? CommandOutcome.Accepted : CommandOutcome.Rejected,
        detail: result.ok ? '' : result.error.code,
        dispatchMs: now() - started,
        queueDepth: readers.pending(),
      });

      return result;
    },
  };
}

/**
 * Builds a handler shaped exactly like the dispatcher's `onExecutionRejected`,
 * so the composition root composes it with the one it already has rather than
 * replacing it.
 *
 * This is the only view of execution the tooling gets, and it is a view of
 * FAILURES only — the hook exists because errors must not vanish, not because
 * devtools asked for it.
 */
export function observeExecutionFailure(
  sink: CommandSink,
  readers: ObservationReaders,
): (command: Command, error: AppError, metadata: CommandMetadata) => void {
  return (command, error, metadata) => {
    sink.record({
      tick: readers.tick(),
      type: command.type,
      source: metadata.source,
      outcome: CommandOutcome.Failed,
      detail: error.code,
      // Nothing was dispatched here — this is the far side of a dispatch that
      // happened ticks ago. Null rather than 0, which would read as "instant".
      dispatchMs: null,
      queueDepth: readers.pending(),
    });
  };
}
