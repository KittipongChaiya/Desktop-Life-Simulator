/**
 * Event monitor — the subscription. Phase-07.8e, ADR-018 §10.
 *
 * "DevTools may subscribe to events, never produce them." This module is where
 * that rule is either kept or broken, so it is the whole of what it does:
 * `subscribe`, and a disposer that unsubscribes. It calls no other method on
 * the bus, and `publish` appears nowhere in this directory.
 *
 * The bus is taken as a TYPE only — `src/devtools` reads sim types and never
 * imports sim code (ADR-018 §4), and the composition root passes the instance.
 */

import type { EventBus } from '../../sim/events/bus';
import type { SimEventName } from '../../sim/events/types';

/**
 * The events the monitor observes.
 *
 * `simulationTick` is deliberately absent. It fires 20 times a second, so a
 * ring recording it would hold ten seconds of heartbeat and nothing else — a
 * monitor whose default configuration destroys what it monitors. Nothing is
 * lost by the omission: every entry carries the tick it was observed on, so
 * recording the tick EVENT would add nothing the records do not already say.
 *
 * Declared explicitly rather than derived from `SimEventMap`, because a new
 * event should be a decision to observe it, not an automatic one — the next
 * per-frame event added would otherwise silently drown this ring too.
 */
export const OBSERVED_EVENTS: readonly SimEventName[] = [
  'appStarted',
  'tileTilled',
  'tileUntilled',
  'cropPlanted',
  'cropHarvested',
  'itemSold',
];

/** What the observer writes to. Structural, so the ring stays independent. */
export interface EventSink {
  record(name: string, tick: number, payload: unknown): void;
}

/**
 * Subscribes `sink` to every observed event. Returns a disposer that detaches
 * all of them, leaving the bus exactly as it was found.
 */
export function observeEvents(bus: EventBus, sink: EventSink, tick: () => number): () => void {
  const disposers = OBSERVED_EVENTS.map((name) =>
    bus.subscribe(name, (payload: unknown) => {
      sink.record(name, tick(), payload);
    }),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
