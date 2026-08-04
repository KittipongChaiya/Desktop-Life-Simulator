/**
 * Command monitor — the bounded ring. Phase-07.8f, ADR-018 §9.
 *
 * Holds observations of commands: what was submitted, what became of it, and
 * what it cost to submit. Like the event ring it only ever RECEIVES — nothing
 * here can dispatch, and the dispatcher is not reachable from this module.
 *
 * A SECOND RING, not a generalisation of the first. The buffer mechanics match
 * `events/ring.ts`, but the records do not: a command has an outcome, an error
 * code, a cost, and a queue depth, none of which an event has. `AI_RULES.md`
 * Rule 5 says abstract on the THIRD occurrence — so if 07.8m's recorder wants a
 * third bounded buffer, that is the point at which the buffer is extracted, and
 * this comment is the note that says so.
 */

/**
 * Observations the command monitor keeps.
 *
 * Larger than the event ring's, because a busy tick dispatches several commands
 * and the interesting ones (a rejection) are usually surrounded by ordinary
 * accepted noise.
 */
export const DEFAULT_COMMAND_RING_CAPACITY = 300;

export const CommandOutcome = {
  /** Passed validation and was queued. */
  Accepted: 'accepted',
  /** Refused at dispatch. This IS the validation result. */
  Rejected: 'rejected',
  /** Accepted, then failed at execution — the world moved underneath it. */
  Failed: 'failed',
} as const;

export type CommandOutcome = (typeof CommandOutcome)[keyof typeof CommandOutcome];

export interface ObservedCommand {
  /** Monotonic observation number. Survives eviction, so gaps are visible. */
  readonly seq: number;
  readonly tick: number;
  readonly type: string;
  readonly source: string;
  readonly outcome: CommandOutcome;
  /** The error code when it was not accepted. Empty when it was. */
  readonly detail: string;
  /**
   * Cost of the DISPATCH — validation and queueing — in milliseconds.
   *
   * Null when there was no dispatch to measure, as for an execution failure
   * observed a tick after the fact. Execution itself is not measured here and
   * cannot be: it happens inside the simulation, and instrumenting it would be
   * a simulation change, which this phase forbids.
   */
  readonly dispatchMs: number | null;
  /** Commands queued at the moment of the observation. */
  readonly queueDepth: number;
}

export interface CommandTally {
  readonly accepted: number;
  readonly rejected: number;
  readonly failed: number;
}

/** The write side, so an observer needs nothing else. */
export interface CommandSink {
  record(entry: Omit<ObservedCommand, 'seq'>): void;
}

export interface CommandRing extends CommandSink {
  /** Oldest first. Stable by identity until the contents change. */
  entries(): readonly ObservedCommand[];
  /** Everything ever observed, including what has since been evicted. */
  observed(): number;
  /** Outcomes across everything observed — not merely what is still held. */
  tally(): CommandTally;
  subscribe(listener: () => void): () => void;
  clear(): void;
  readonly capacity: number;
}

export function createCommandRing(capacity: number): CommandRing {
  const listeners = new Set<() => void>();
  let entries: readonly ObservedCommand[] = Object.freeze([]);
  let observed = 0;
  let accepted = 0;
  let rejected = 0;
  let failed = 0;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    capacity,

    record(entry) {
      observed += 1;
      if (entry.outcome === CommandOutcome.Accepted) accepted += 1;
      else if (entry.outcome === CommandOutcome.Rejected) rejected += 1;
      else failed += 1;

      const next = [...entries, Object.freeze({ seq: observed, ...entry })];
      entries = Object.freeze(next.length > capacity ? next.slice(next.length - capacity) : next);
      notify();
    },

    entries: () => entries,
    observed: () => observed,
    tally: () => ({ accepted, rejected, failed }),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear() {
      entries = Object.freeze([]);
      observed = 0;
      accepted = 0;
      rejected = 0;
      failed = 0;
      notify();
    },
  };
}
