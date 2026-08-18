/**
 * v12 → v13: the world widens for the wilds. ADR-037 §1, phase-27.
 *
 * The grid grows from 80×64 to 112×64 — two more chunk columns east of the
 * town, which become gatherable land. A flat tile index encodes the width it
 * was computed against, so this link re-lays the dense grid arrays and remaps
 * every stored index:
 *
 *     remap(i) = floor(i / 80) * 112 + (i % 80)
 *
 * A thing at (x, y) before is at (x, y) after; the new band carries nothing.
 *
 * The NODES are not added here, and could not be: their existence is derived
 * from a hash of (seed, tile) and never stored (ADR-037 §3), so there is
 * nothing for a migration to write. `harvestedAt` appears empty — a v12 world
 * had no wilds, so nothing in them has been worked.
 *
 * **The dimensions are literals, deliberately** — the same rule v6→v7 states,
 * and this link is the reason that rule was written down. It converts
 * documents written against width 80 into documents at width 112, forever.
 * Importing the live `WORLD_WIDTH` would have silently rewritten what v6→v7
 * does the moment this phase landed, which is exactly the trap that comment
 * was guarding (`SAVE_FORMAT.md` §4.2).
 *
 * Structurally identical to v6→v7 by design. The duplication is deliberate:
 * a frozen link may never change behaviour, and sharing a helper with a
 * later link is how one of them eventually does.
 */

import { decodeBytes, decodeUint32, encodeBytes, encodeUint32 } from '../base64';
import type { Migration } from '../migrate';

const NEW_WIDTH = 112;
const NEW_HEIGHT = 64;
const NEW_TILE_COUNT = NEW_WIDTH * NEW_HEIGHT;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `Array.isArray` narrowed to `unknown[]` — `any[]` leaks unsafety into maps. */
const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/**
 * The re-lay, closed over the DOCUMENT's own dimensions — every real v6 save
 * is 64×64, but the width a save was written against is the save's to state
 * (the `v4 → v5` sizing rule, `migration-v4-to-v5.test.ts`).
 */
function relayerFor(oldWidth: number, oldHeight: number) {
  const copyWidth = Math.min(oldWidth, NEW_WIDTH);
  const copyHeight = Math.min(oldHeight, NEW_HEIGHT);

  /** Remaps one flat index; anything that is not a whole number passes through. */
  const remap = (tile: unknown): unknown =>
    typeof tile === 'number' && Number.isInteger(tile) && tile >= 0
      ? Math.floor(tile / oldWidth) * NEW_WIDTH + (tile % oldWidth)
      : tile;

  const remapArray = (tiles: unknown): unknown => (isArray(tiles) ? tiles.map(remap) : tiles);

  /** Remaps the named tile field of every record in a list. */
  function remapTileField(list: unknown, field: string): unknown {
    if (!isArray(list)) return list;
    return list.map((entry) =>
      isRecord(entry) ? { ...entry, [field]: remap(entry[field]) } : entry,
    );
  }

  /** One row at a time: old row y lands at the start of new row y, rest stays 0. */
  function relayBytes(encoded: unknown): unknown {
    if (typeof encoded !== 'string') return encoded;
    const old = decodeBytes(encoded);
    const next = new Uint8Array(NEW_TILE_COUNT);
    for (let y = 0; y < copyHeight; y += 1) {
      const row = old.subarray(y * oldWidth, y * oldWidth + copyWidth);
      next.set(row, y * NEW_WIDTH);
    }
    return encodeBytes(next);
  }

  function relayWords(encoded: unknown): unknown {
    if (typeof encoded !== 'string') return encoded;
    const old = decodeUint32(encoded);
    const next = new Uint32Array(NEW_TILE_COUNT);
    for (let y = 0; y < copyHeight; y += 1) {
      const row = old.subarray(y * oldWidth, y * oldWidth + copyWidth);
      next.set(row, y * NEW_WIDTH);
    }
    return encodeUint32(next);
  }

  /** The bitfield cannot be row-copied — bits shift within bytes. Bit by bit. */
  function relayBits(encoded: unknown): unknown {
    if (typeof encoded !== 'string') return encoded;
    const old = decodeBytes(encoded);
    const next = new Uint8Array(Math.ceil(NEW_TILE_COUNT / 8));
    for (let tile = 0; tile < oldWidth * oldHeight; tile += 1) {
      const set = ((old[tile >> 3] ?? 0) & (1 << (tile & 7))) !== 0;
      if (!set) continue;
      const moved = remap(tile) as number;
      if (moved >= NEW_TILE_COUNT) continue;
      const byte = next[moved >> 3];
      if (byte !== undefined) next[moved >> 3] = byte | (1 << (moved & 7));
    }
    return encodeBytes(next);
  }

  function migrateWorker(worker: unknown): unknown {
    if (!isRecord(worker)) return worker;
    const task = worker['task'];
    const schedule = worker['schedule'];
    return {
      ...worker,
      position: remap(worker['position']),
      path: remapArray(worker['path']),
      task: isRecord(task) ? { ...task, tile: remap(task['tile']) } : task,
      schedule: isRecord(schedule)
        ? schedule['zone'] === undefined
          ? schedule
          : { ...schedule, zone: remapArray(schedule['zone']) }
        : schedule,
    };
  }

  return { remap, remapTileField, relayBytes, relayWords, relayBits, migrateWorker };
}

export const v12ToV13: Migration = {
  from: 12,
  to: 13,
  describe: 'widen the grid to 112×64 for the wilds and re-lay every tile index (ADR-037)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const grid = isRecord(world['grid']) ? world['grid'] : {};
    // A v12 document without usable dimensions still remaps against 80 — the
    // width every pre-v13 save was in fact written at. Historical, so literal.
    const oldWidth = typeof grid['width'] === 'number' && grid['width'] > 0 ? grid['width'] : 80;
    const oldHeight =
      typeof grid['height'] === 'number' && grid['height'] > 0 ? grid['height'] : 64;
    const { remap, remapTileField, relayBytes, relayWords, relayBits, migrateWorker } = relayerFor(
      oldWidth,
      oldHeight,
    );
    const quarantine = isRecord(document['quarantine']) ? document['quarantine'] : {};
    const quarantineBuildings = isArray(quarantine['buildings'])
      ? quarantine['buildings'].map((entry) =>
          isRecord(entry) && isRecord(entry['building'])
            ? {
                ...entry,
                building: { ...entry['building'], tile: remap(entry['building']['tile']) },
              }
            : entry,
        )
      : quarantine['buildings'];

    return {
      ...document,
      schemaVersion: 13,
      world: {
        ...world,
        grid: {
          ...grid,
          width: NEW_WIDTH,
          height: NEW_HEIGHT,
          kind: relayBytes(grid['kind']),
          owned: relayBits(grid['owned']),
          tilledAt: relayWords(grid['tilledAt']),
          wateredAt: relayWords(grid['wateredAt']),
        },
        crops: remapTileField(world['crops'], 'tile'),
        workers: isArray(world['workers']) ? world['workers'].map(migrateWorker) : world['workers'],
        buildings: remapTileField(world['buildings'], 'tile'),
        lastPlanted: remapTileField(world['lastPlanted'], 'tile'),
        // Empty: a v12 world had no wilds, so nothing in them has been worked.
        harvestedAt: [],
      },
      quarantine: {
        ...quarantine,
        crops: remapTileField(quarantine['crops'], 'tile'),
        buildings: quarantineBuildings,
        lastPlanted: remapTileField(quarantine['lastPlanted'], 'tile'),
      },
    };
  },
};
