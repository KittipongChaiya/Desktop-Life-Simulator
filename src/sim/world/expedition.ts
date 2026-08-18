/**
 * Expeditions in progress — the one thing about a trip that is stored.
 * Phase-28, ADR-038 §3.
 *
 * Three fields, and everything a player or a system wants to know is
 * arithmetic on them:
 *
 * | Question             | Answer                                        |
 * | -------------------- | --------------------------------------------- |
 * | When does it return? | `departedTick + travelTicks`                  |
 * | Is it back yet?      | `tick >= departedTick + travelTicks`          |
 * | What does it bring?  | `haulFor(seed, worker, departedTick)`         |
 * | How long is left?    | `departedTick + travelTicks - tick`           |
 *
 * **This is ADR-037's model applied to time instead of space.** The wilds
 * derive what stands on a tile from a hash and store only the tick a node was
 * worked; an expedition derives everything from a hash and stores only the tick
 * a worker left. Both buy the same thing: an absence of any length resolves
 * exactly, because the answer never depended on the ticks in between.
 *
 * A remaining-time field would be the alternative, and it is the trap ADR-005
 * §2 names — a countdown changes every tick, so it would republish the slice 20
 * times a second for the whole of an hours-long trip.
 *
 * KEYED BY WORKER, not by an expedition id. A worker is on at most one trip,
 * so the worker IS the key: there is no id to allocate, no counter to persist,
 * and no way to end up with two rows claiming the same hand.
 */

import type { ContentId, WorkerId } from '../../shared/ids';

export interface Expedition {
  readonly worker: WorkerId;
  readonly destination: ContentId;
  /** The tick the worker left. The whole trip is derived from it. */
  readonly departedTick: number;
}

/** Sparse store keyed by the worker who is away. */
export type ExpeditionStore = Map<WorkerId, Expedition>;

export function createExpeditionStore(): ExpeditionStore {
  return new Map();
}

/** Expeditions in ascending worker order — the deterministic scan order. */
export function expeditionsInOrder(store: ExpeditionStore): readonly Expedition[] {
  return [...store.values()].sort((a, b) => a.worker - b.worker);
}
