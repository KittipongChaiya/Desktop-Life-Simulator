/**
 * The migration chain. Phase-07b — ADR-002 §3, ADR-015 §3.
 *
 * ORDERED DATA, not re-exports — one of the repo's two sanctioned `index.ts`
 * files (`PROJECT_STRUCTURE.md` §5.4), because the order IS the chain.
 *
 * Empty at version 1, and that is the point: the runner, its startup
 * validation, and the golden fixtures all ship BEFORE the first real
 * migration exists, so when v0.2 changes the persisted shape, the session
 * writing that migration adds one entry here, one golden fixture at the
 * previous version, and nothing else (`SAVE_FORMAT.md` §9).
 *
 * APPEND-ONLY once merged: saves at every prior state exist on real disks.
 * A wrong migration is repaired by a new one after it, never by editing
 * (ADR-015 §3).
 */

import type { Migration } from '../migrate';

import { v1ToV2 } from './v1-to-v2';
import { v2ToV3 } from './v2-to-v3';
import { v3ToV4 } from './v3-to-v4';
import { v4ToV5 } from './v4-to-v5';
import { v5ToV6 } from './v5-to-v6';

export const MIGRATIONS: readonly Migration[] = [
  // Phase-09b: the first link. Records the world's content sources (ADR-026 §4)
  // and its disabled set (ADR-019 §7).
  v1ToV2,
  // Phase-10b: the day is derived, but its length and phases are frozen per
  // world so a rebalance cannot renumber anyone's past (ADR-020 §2).
  v2ToV3,
  v3ToV4,
  v4ToV5,
  v5ToV6,
];
