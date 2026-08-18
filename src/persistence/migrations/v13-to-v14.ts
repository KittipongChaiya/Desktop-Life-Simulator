/**
 * v13 to v14. Phase-28 — ADR-038, ADR-015 section 3.
 *
 * Expeditions arrive, and this is the smallest link in the chain: one empty
 * collection.
 *
 * - `world.expeditions`, empty. A v13 world had no way to send anyone
 *   anywhere, so nobody is away — which makes empty EXACT rather than a
 *   default that happens to be safe.
 *
 * **There is no id counter to add**, unlike v11 to v12. An expedition is keyed
 * by the worker who is on it, because a worker is on at most one trip, so
 * there is no id to allocate and no counter to persist (ADR-038 section 3).
 *
 * **And no worker field to add**, unlike v11 to v12's `hauling`. A worker who
 * is away is in `WorkerState.Away`, and `state` is already persisted — a v13
 * worker simply cannot be in a state v13 could not write, so a document that
 * somehow contained one would be malformed rather than old, and this link
 * deliberately does not paper over that.
 *
 * The whole trip is derived from `departedTick` (section 3), so a save written
 * mid-expedition in some future version resumes mid-flight for free: the
 * return is a comparison, not a countdown that has to be caught up.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const v13ToV14: Migration = {
  from: 13,
  to: 14,
  describe: 'add the expedition table, empty — a v13 world could send nobody anywhere (ADR-038)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};

    return {
      ...document,
      schemaVersion: 14,
      world: {
        ...world,
        expeditions: [],
      },
    };
  },
};
