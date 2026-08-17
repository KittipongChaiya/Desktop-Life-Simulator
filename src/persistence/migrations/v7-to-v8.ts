/**
 * v7 → v8: the world learns to hold a promise. ADR-032 §2, phase-20.
 *
 * Adds `world.contracts` (empty — no pre-v8 save can have accepted one,
 * because the mechanic did not exist) and `world.contractStats` at zero.
 * Explicit defaults in the migration, never a tolerant reader
 * (`SAVE_FORMAT.md` §11.2's rule for additions).
 *
 * Nothing else is touched: offers are derived and never stored (ADR-032 §1),
 * so the board itself costs this link nothing.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const v7ToV8: Migration = {
  from: 7,
  to: 8,
  describe: 'add the contract store and its counters, both empty (ADR-032)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    return {
      ...document,
      schemaVersion: 8,
      world: {
        ...world,
        contracts: [],
        contractStats: { fulfilled: 0, expired: 0 },
      },
    };
  },
};
