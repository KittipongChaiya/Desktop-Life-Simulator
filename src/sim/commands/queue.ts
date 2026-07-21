/**
 * The command queue. ADR-010 §4.
 *
 * FIFO, drained whole on the tick boundary. Ordering is the property replay and
 * determinism rest on, so this is a plain array rather than anything cleverer:
 * a priority queue or a map would make execution order a function of something
 * other than dispatch order, which is exactly what ADR-010 forbids.
 *
 * DE-DUPLICATION IS SCOPED TO THE PENDING WINDOW. Keys are cleared on every
 * drain, so the set is bounded by one tick's dispatches rather than growing
 * with playtime (`AI_RULES.md` §2.3). It catches the case that actually occurs
 * — the same action issued twice before either could apply, such as a
 * double-click — without ever suppressing a legitimate repeat on a later tick.
 */

import type { QueuedCommand } from './types';

export interface CommandQueue {
  enqueue(entry: QueuedCommand): void;
  /** Removes and returns everything queued, in dispatch order. */
  drain(): readonly QueuedCommand[];
  /** True if a pending entry carries this de-duplication key. */
  has(key: string): boolean;
  readonly size: number;
}

export function createCommandQueue(): CommandQueue {
  let entries: QueuedCommand[] = [];
  const keys = new Set<string>();

  return {
    enqueue(entry) {
      entries.push(entry);
      if (entry.key !== undefined) keys.add(entry.key);
    },

    drain() {
      if (entries.length === 0) return [];

      // Swap rather than splice: a handler that dispatches during execution
      // lands in the NEW queue and waits for the next tick, mirroring how the
      // event bus handles publish-during-flush (ADR-008).
      const batch = entries;
      entries = [];
      keys.clear();
      return batch;
    },

    has: (key) => keys.has(key),

    get size() {
      return entries.length;
    },
  };
}
