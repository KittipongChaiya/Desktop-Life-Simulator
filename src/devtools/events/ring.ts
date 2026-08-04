/**
 * Event monitor — the bounded ring. Phase-07.8e, ADR-018 §9/§10.
 *
 * Holds what the observer saw, and nothing else: it has no reference to a bus,
 * no way to reach one, and no method that could publish. That is structural
 * rather than a promise — a monitor that could re-emit would make the event
 * graph differ between builds, which is the failure ADR-018 §10 exists to
 * refuse.
 *
 * BOUNDED IN BOTH DIRECTIONS. The entry count is capped, and so is the size of
 * each entry: a bounded count of unbounded records is unbounded. A payload is
 * summarised to a string at record time and truncated, so the ring's footprint
 * has a stated ceiling rather than one that depends on what the game happens to
 * publish.
 *
 * Entries are rebuilt immutably, so the array identity changes exactly when the
 * contents do — which is what lets the panel subscribe through
 * `useSyncExternalStore` and re-render only on a real change (criterion 9).
 */

/** Longest summary retained per entry. Beyond this the record is elided. */
export const SUMMARY_LIMIT = 160;

export interface ObservedEvent {
  /** Monotonic observation number. Survives eviction, so gaps are visible. */
  readonly seq: number;
  readonly name: string;
  /** The simulation tick the observation happened on. */
  readonly tick: number;
  /** The payload, rendered. Never the payload itself. */
  readonly summary: string;
}

export interface EventRing {
  /** Records one observation, evicting the oldest when full. */
  record(name: string, tick: number, payload: unknown): void;
  /** Oldest first. Stable by identity until the contents change. */
  entries(): readonly ObservedEvent[];
  /** Everything ever observed, including what has since been evicted. */
  observed(): number;
  subscribe(listener: () => void): () => void;
  clear(): void;
  readonly capacity: number;
}

/**
 * Renders a payload for display.
 *
 * A payload that cannot be serialised is RECORDED AS SUCH rather than dropped:
 * the fact that an event happened is the more important half, and silently
 * losing it would make the monitor lie by omission (AI_RULES.md §2.2).
 */
function summarise(payload: unknown): string {
  let text: string;
  try {
    text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return '<unserialisable>';
  }

  if (text === undefined) return '<undefined>';
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}…` : text;
}

export function createEventRing(capacity: number): EventRing {
  const listeners = new Set<() => void>();
  let entries: readonly ObservedEvent[] = Object.freeze([]);
  let observed = 0;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    capacity,

    record(name, tick, payload) {
      observed += 1;
      const next = [...entries, { seq: observed, name, tick, summary: summarise(payload) }];
      entries = Object.freeze(next.length > capacity ? next.slice(next.length - capacity) : next);
      notify();
    },

    entries: () => entries,
    observed: () => observed,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear() {
      entries = Object.freeze([]);
      observed = 0;
      notify();
    },
  };
}
