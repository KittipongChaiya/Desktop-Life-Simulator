/**
 * v5 → v6: every worker gains a schedule. ADR-024 §4, ADR-027.
 *
 * A schedule is **simulation state**, not a preference (ADR-024 §4): two
 * players with one seed and different schedules have different farms, so it
 * belongs in the save and in the command stream rather than in
 * `settings.json`. This is the link that puts it there.
 *
 * Every worker migrates to `{}` — **absent, not empty**. The distinction is
 * the one the whole vocabulary rests on: an absent field means unconstrained,
 * an empty array means constrained to nothing. A v5 worker could do anything,
 * anywhere, at any hour, so `{}` states that exactly. Migrating to
 * `{ taskKinds: [] }` would have silently idled every worker on every existing
 * save.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const v5ToV6: Migration = {
  from: 5,
  to: 6,
  describe: 'give every worker an unconstrained schedule (v6)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const workers: readonly unknown[] = Array.isArray(world['workers'])
      ? (world['workers'] as readonly unknown[])
      : [];

    return {
      ...document,
      schemaVersion: 6,
      world: {
        ...world,
        workers: workers.map((worker) => (isRecord(worker) ? { ...worker, schedule: {} } : worker)),
      },
    };
  },
};
