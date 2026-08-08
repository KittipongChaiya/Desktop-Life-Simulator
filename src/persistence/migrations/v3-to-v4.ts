/**
 * v3 → v4: the season's length and the year's order. ADR-021 §1, ADR-027.
 *
 * The season itself needs no migration — it is derived from the day, which is
 * derived from the tick (ADR-021 §1). What this link adds is the two INPUTS to
 * that derivation, for the reason `v2-to-v3` added the day's: both are frozen
 * per world, because changing either reinterprets the player's whole past.
 *
 * ## The season list is a frozen literal, not a registry read
 *
 * The obvious implementation asks `createInstalledRegistries()` what the
 * seasons are. It is wrong, and quietly: a migration must be a **pure function
 * of the document**, or the same save migrates to two different worlds on two
 * machines with different content installed — and the golden fixture that is
 * supposed to catch that would itself vary by environment.
 *
 * So the four seasons that shipped with v0.2 are written out here, and they
 * stay written out forever, even after `plugins/core` grows a fifth. This link
 * describes what a v3 world WAS, not what content is available now.
 *
 * That is also why this synthesises where `v1-to-v2` refused to. A v1 save
 * carried no record of its sources, so any manifest would have been a claim
 * about history nobody made. A v3 save carries no seasons because seasons did
 * not exist yet — every v3 world ran under exactly one implicit year, the
 * shipped one, and writing it down states that rather than guessing it.
 */

import { DEFAULT_DAYS_PER_SEASON } from '../../shared/constants';
import type { Migration } from '../migrate';

/**
 * The season order as v0.2 shipped it.
 *
 * Duplicated from `plugins/core` ON PURPOSE. Importing it would couple this
 * link to content that may change, which is the one thing a migration may not
 * be. If these ever disagree, this one is right — it is a historical record.
 */
const V4_SEASONS: readonly string[] = ['core:spring', 'core:summer', 'core:autumn', 'core:winter'];

export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  describe: "freeze the world's season length and season order (v4)",

  migrate(document) {
    const world = document['world'];
    const worldRecord = typeof world === 'object' && world !== null ? world : {};

    return {
      ...document,
      schemaVersion: 4,
      world: {
        ...worldRecord,
        daysPerSeason: DEFAULT_DAYS_PER_SEASON,
        seasons: [...V4_SEASONS],
      },
    };
  },
};
