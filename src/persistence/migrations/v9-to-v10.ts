/**
 * v9 → v10: the board widens, quests arrive. ADR-034 §3, §6 — phase-22.
 *
 * Three changes in one link:
 *
 * - **Offer ids re-key.** Identity was `day × 2 + slot`; the four-slot board
 *   (ADR-034 §2) makes it `day × 4 + slot`. Accepted contracts carry the old
 *   ids, so each is re-keyed: `day = ⌊id / 2⌋`, `slot = id % 2`,
 *   `newId = day × 4 + slot` — total and collision-free, and the
 *   double-acceptance guard survives because open offers keep slots 0–1 in
 *   both schemes. Every frozen term rides through untouched: the save
 *   carries the deal, not the formula — including the deal's name.
 * - **`contractStats.byRequester` appears, empty.** Per-resident history
 *   before v10 was never recorded; inventing it would be fiction.
 * - **`world.quests` appears, empty.** The chains read the counters, so a
 *   migrated save with prior fulfillments is paid what its recorded history
 *   earned on the first live tick — deliberate (ADR-034 §4).
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/** `day × 2 + slot` → `day × 4 + slot`. */
const rekeyOfferId = (offerId: number): number => Math.floor(offerId / 2) * 4 + (offerId % 2);

export const v9ToV10: Migration = {
  from: 9,
  to: 10,
  describe: 're-key offers for the four-slot board; add quest and per-requester state (ADR-034)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const contracts = isArray(world['contracts']) ? world['contracts'] : [];
    const contractStats = isRecord(world['contractStats']) ? world['contractStats'] : {};
    return {
      ...document,
      schemaVersion: 10,
      world: {
        ...world,
        contracts: contracts.map((contract) =>
          isRecord(contract) && typeof contract['offerId'] === 'number'
            ? { ...contract, offerId: rekeyOfferId(contract['offerId']) }
            : contract,
        ),
        contractStats: { ...contractStats, byRequester: {} },
        quests: {},
      },
    };
  },
};
