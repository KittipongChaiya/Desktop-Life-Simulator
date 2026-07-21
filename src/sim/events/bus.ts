/**
 * Typed event bus. ADR-008.
 *
 * QUEUE-AND-FLUSH, not immediate dispatch. `publish` appends to a queue that
 * `flush` drains at a controlled point in the tick (`ARCHITECTURE.md` §3.5).
 * Dispatching mid-system would let a subscriber mutate state another system is
 * still iterating — a class of bug that is intermittent, order-dependent, and
 * extremely hard to reproduce.
 *
 * NO GLOBAL STATE. `createEventBus()` returns an instance; there is no module
 * singleton and no service locator. Two worlds in one process (a test, a future
 * replay verifier) never share a bus.
 *
 * ORDERING is deterministic: publish order within a flush, and subscriber
 * registration order within an event. Both are required by ADR-007's
 * determinism guarantee — a bus that dispatched in `Set` iteration order of a
 * hash would make identical inputs produce different outcomes.
 */

import type { SimEventMap, SimEventName } from './types';

export type EventHandler<K extends SimEventName> = (payload: SimEventMap[K]) => void;

/** A published-but-not-yet-dispatched event. */
interface QueuedEvent {
  readonly name: SimEventName;
  readonly payload: unknown;
}

export interface EventBusOptions {
  /**
   * Called when a subscriber throws.
   *
   * A throwing subscriber must never stop the others or abort the tick, but it
   * must also never vanish silently (AI_RULES.md §2.2).
   */
  readonly onHandlerError?: (name: SimEventName, error: unknown) => void;
}

export interface EventBus {
  /**
   * Subscribes to an event. Returns an unsubscribe function.
   *
   * Subscribing the same handler twice for the same event is a no-op: it stays
   * registered once and is invoked once. Double-subscription is otherwise a
   * silent doubling of every side effect.
   */
  subscribe<K extends SimEventName>(name: K, handler: EventHandler<K>): () => void;

  /** Removes a handler. Safe to call for a handler that is not subscribed. */
  unsubscribe<K extends SimEventName>(name: K, handler: EventHandler<K>): void;

  /** Queues an event. Subscribers run at the next `flush`, never inline. */
  publish<K extends SimEventName>(name: K, payload: SimEventMap[K]): void;

  /**
   * Dispatches every queued event in publish order.
   *
   * Events published DURING a flush are queued for the next one rather than
   * appended to the batch in progress, so a subscriber that publishes cannot
   * produce an unbounded dispatch loop.
   *
   * @returns the number of events dispatched.
   */
  flush(): number;

  /** Queued but undispatched events. Diagnostics and tests. */
  pending(): number;

  /** Subscriber count for an event. Diagnostics and tests. */
  subscriberCount(name: SimEventName): number;

  /** Drops all subscribers and queued events. */
  clear(): void;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  // Set preserves insertion order, which is what makes subscriber order
  // deterministic without a separate sort.
  const handlers = new Map<SimEventName, Set<(payload: unknown) => void>>();
  let queue: QueuedEvent[] = [];

  return {
    subscribe(name, handler) {
      let set = handlers.get(name);
      if (set === undefined) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler as (payload: unknown) => void);

      return () => {
        this.unsubscribe(name, handler);
      };
    },

    unsubscribe(name, handler) {
      const set = handlers.get(name);
      if (set === undefined) return;

      set.delete(handler as (payload: unknown) => void);
      if (set.size === 0) handlers.delete(name);
    },

    publish(name, payload) {
      queue.push({ name, payload });
    },

    flush() {
      if (queue.length === 0) return 0;

      // Swap the queue out before dispatching. Anything published by a
      // subscriber lands in the NEW queue and waits for the next flush.
      const batch = queue;
      queue = [];

      for (const event of batch) {
        const set = handlers.get(event.name);
        if (set === undefined) continue;

        // Iterate a snapshot: a subscriber may unsubscribe itself or others
        // during dispatch, and mutating a Set mid-iteration skips entries.
        for (const handler of [...set]) {
          try {
            handler(event.payload);
          } catch (error) {
            options.onHandlerError?.(event.name, error);
          }
        }
      }

      return batch.length;
    },

    pending: () => queue.length,
    subscriberCount: (name) => handlers.get(name)?.size ?? 0,

    clear() {
      handlers.clear();
      queue = [];
    },
  };
}
