/**
 * v2 → v3: the world freezes its day. Phase-10b — ADR-020 §2, §3.
 *
 * The calendar itself is a derivation and needs no migration (ADR-020 §1) —
 * what needs one is the day's LENGTH and its PHASES, because both must be
 * frozen per world. Change either on an existing world and every past day is
 * silently reinterpreted: a different length renumbers them, a different phase
 * set changes what each day contained.
 *
 * A v2 save predates the calendar entirely, so its ticks have never been read
 * as days. Giving it the current defaults is therefore not an assumption about
 * its past — there is no past to contradict. That is the difference between
 * this and `v1-to-v2`'s empty manifest, where a default WOULD have invented
 * history the save never recorded.
 */

import { DEFAULT_TICKS_PER_DAY } from '../../shared/constants';
import { DAY_PHASES } from '../../sim/time/game-clock';
import type { Migration } from '../migrate';

export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  describe: "freeze the world's day length and phase set (v3)",

  migrate(document) {
    const world = document['world'];
    const worldRecord = typeof world === 'object' && world !== null ? world : {};

    return {
      ...document,
      schemaVersion: 3,
      world: {
        ...worldRecord,
        ticksPerDay: DEFAULT_TICKS_PER_DAY,
        dayPhases: [...DAY_PHASES],
      },
    };
  },
};
