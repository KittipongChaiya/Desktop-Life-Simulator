/**
 * v11 to v12. Phase-26 — ADR-036, ADR-015 section 3.
 *
 * Logistics arrives. Three additions, all empty or neutral:
 *
 * - `world.routes`, empty. A v11 world had no way to declare one.
 * - `ids.route`, starting at 1. Not zero: zero is reserved as "no entity"
 *   throughout the allocator, so the first route allocated must be id 1, and a
 *   counter restored at 0 would hand out an id that reads as absent.
 * - `hauling: null` on every worker — nobody was part-way through a route,
 *   because routes did not exist.
 *
 * The worker field is the one worth care. It is half a RESERVATION (ADR-036
 * section 4 as amended): a worker carrying for route R has claimed space at R's
 * destination. Migrating it to null is correct precisely because a v11 worker
 * cannot have been carrying for a route, and a defensive `?? null` at the read
 * site would have hidden a genuinely malformed document instead.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export const v11ToV12: Migration = {
  from: 11,
  to: 12,
  describe: 'add routes, the route id counter, and per-worker haul state (ADR-036)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const ids = isRecord(world['ids']) ? world['ids'] : {};
    const workers = isArray(world['workers']) ? world['workers'] : [];

    return {
      ...document,
      schemaVersion: 12,
      world: {
        ...world,
        routes: [],
        ids: { ...ids, route: 1 },
        workers: workers.map((worker) =>
          isRecord(worker) ? { ...worker, hauling: null } : worker,
        ),
      },
    };
  },
};
