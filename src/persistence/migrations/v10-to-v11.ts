/**
 * v10 → v11. Phase-25 — ADR-035, ADR-015 §3.
 *
 * Factories arrive. The link adds one empty collection and touches nothing
 * else: a v10 world had no building any recipe could name, so there is no
 * production state to reconstruct and none to invent. Migrations transform
 * SHAPE (ADR-015 §3), and an empty side-table is the whole of the shape change.
 *
 * The mill and kitchen themselves are CONTENT, not shape, so they appear in a
 * migrated save's shop the moment it loads — the same way the town appeared
 * beside a migrated v0.2 farm rather than being written in by its link
 * (ADR-030 §2, §3). The player's world has grown while they were away, which is
 * the product's promise arriving as a building list.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const v10ToV11: Migration = {
  from: 10,
  to: 11,
  describe: 'add the factory production side-table, empty (ADR-035)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    return {
      ...document,
      schemaVersion: 11,
      world: {
        ...world,
        factories: [],
      },
    };
  },
};
