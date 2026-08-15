/**
 * v6 → v7, the world-extension link. Phase-18 — ADR-030 §2, `SAVE_FORMAT.md` §9.
 *
 * The grid widened from 64×64 to 80×64 (the town's chunk column, ADR-030 §1),
 * and a flat index encodes the width it was computed against — so every stored
 * tile index must be re-laid or the whole farm shears eastward by rows.
 *
 * The property that matters is stated in coordinates, not indices: **a thing
 * at (x, y) before the migration is at (x, y) after it.** Indices change;
 * places do not. The migration adds NO content — the town is founded by world
 * construction (ADR-030 §3), never by a shape transform.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeBytes, decodeUint32 } from '../src/persistence/base64';
import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { v6ToV7 } from '../src/persistence/migrations/v6-to-v7';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { WORLD_HEIGHT, WORLD_TILE_COUNT, WORLD_WIDTH } from '../src/shared/constants';
import {
  CORE_CASTLE,
  CORE_COTTAGE,
  CORE_NOTICE_BOARD,
  CORE_WELL,
  TOWN_PLACEMENTS,
} from '../src/sim/content/town';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v6Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v6-'));

/** The width every pre-v7 save was written against. Frozen history, so a literal. */
const OLD_WIDTH = 64;

const remap = (tile: number): number =>
  Math.floor(tile / OLD_WIDTH) * WORLD_WIDTH + (tile % OLD_WIDTH);

function raw(name: string): SaveDocument {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
}

function migrated(name: string): SaveDocument {
  const run = runMigrations(
    raw(name) as unknown as { schemaVersion: number },
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
  );
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

/** Reads one bit of a decoded bitfield. */
const bit = (bytes: Uint8Array, index: number): boolean =>
  ((bytes[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;

describe('the v6 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v6Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v6Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v6Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v6Fixtures)('%s migrates identically when run twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });
});

describe('places survive the widening (ADR-030 §2)', () => {
  it.each(v6Fixtures)('%s: the grid is re-laid to 80×64 with the east band empty', (name) => {
    const grid = migrated(name).world.grid;
    expect(grid.width).toBe(WORLD_WIDTH);
    expect(grid.height).toBe(WORLD_HEIGHT);

    const kind = decodeBytes(grid.kind);
    const owned = decodeBytes(grid.owned);
    const tilledAt = decodeUint32(grid.tilledAt);
    const wateredAt = decodeUint32(grid.wateredAt);
    expect(kind.length).toBe(WORLD_TILE_COUNT);
    expect(tilledAt.length).toBe(WORLD_TILE_COUNT);
    expect(wateredAt.length).toBe(WORLD_TILE_COUNT);

    // The padded band carries exactly nothing: default kind, unowned,
    // untouched. The town is NOT here — migrations transform shape, and the
    // town is founded by construction (ADR-030 §3).
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = OLD_WIDTH; x < WORLD_WIDTH; x += 1) {
        const tile = y * WORLD_WIDTH + x;
        expect(kind[tile]).toBe(0);
        expect(bit(owned, tile)).toBe(false);
        expect(tilledAt[tile]).toBe(0);
        expect(wateredAt[tile]).toBe(0);
      }
    }
  });

  it.each(v6Fixtures)('%s: every tile keeps its (x, y) through the re-lay', (name) => {
    const before = raw(name).world.grid;
    const after = migrated(name).world.grid;

    const kindBefore = decodeBytes(before.kind);
    const kindAfter = decodeBytes(after.kind);
    const ownedBefore = decodeBytes(before.owned);
    const ownedAfter = decodeBytes(after.owned);
    const tilledBefore = decodeUint32(before.tilledAt);
    const tilledAfter = decodeUint32(after.tilledAt);
    const wateredBefore = decodeUint32(before.wateredAt);
    const wateredAfter = decodeUint32(after.wateredAt);

    for (let tile = 0; tile < OLD_WIDTH * WORLD_HEIGHT; tile += 1) {
      const moved = remap(tile);
      expect(kindAfter[moved]).toBe(kindBefore[tile]);
      expect(bit(ownedAfter, moved)).toBe(bit(ownedBefore, tile));
      expect(tilledAfter[moved]).toBe(tilledBefore[tile]);
      expect(wateredAfter[moved]).toBe(wateredBefore[tile]);
    }
  });

  it.each(v6Fixtures)('%s: every stored tile index is remapped, nothing else touched', (name) => {
    const before = raw(name);
    const after = migrated(name);

    expect(after.world.crops.map((c) => c.tile)).toEqual(
      before.world.crops.map((c) => remap(c.tile)),
    );
    expect(after.world.buildings.map((b) => b.tile)).toEqual(
      before.world.buildings.map((b) => remap(b.tile)),
    );
    expect(after.world.lastPlanted.map((e) => e.tile)).toEqual(
      before.world.lastPlanted.map((e) => remap(e.tile)),
    );

    for (const [index, worker] of after.world.workers.entries()) {
      const was = before.world.workers[index];
      if (was === undefined) throw new Error('worker count changed');
      expect(worker.position).toBe(remap(was.position));
      expect(worker.path).toEqual(was.path.map(remap));
      expect(worker.task?.tile).toBe(was.task === null ? undefined : remap(was.task.tile));
      expect(worker.schedule.zone).toEqual(was.schedule.zone?.map(remap));
      // Everything that is not a tile index is untouched.
      expect(worker.energy).toBe(was.energy);
      expect(worker.carrying).toEqual(was.carrying);
    }

    expect(after.world.crops.map((c) => c.cropId)).toEqual(before.world.crops.map((c) => c.cropId));
    expect(after.world.rngState).toEqual(before.world.rngState);
    expect(after.world.tick).toBe(before.world.tick);
  });

  it.each(v6Fixtures)('%s: the quarantine is remapped too', (name) => {
    const before = raw(name);
    const after = migrated(name);

    expect(after.quarantine.crops.map((c) => c.tile)).toEqual(
      before.quarantine.crops.map((c) => remap(c.tile)),
    );
    expect(after.quarantine.buildings.map((b) => b.building.tile)).toEqual(
      before.quarantine.buildings.map((b) => remap(b.building.tile)),
    );
    expect(after.quarantine.lastPlanted.map((e) => e.tile)).toEqual(
      before.quarantine.lastPlanted.map((e) => remap(e.tile)),
    );
  });

  it('remaps a POPULATED quarantine — the fixtures carry empty ones', () => {
    // The golden fixtures never quarantined anything, so without this the
    // quarantine branch passes vacuously (it did once: an undefined helper in
    // an empty .map survived every fixture and fell to the type checker).
    const document = v6ToV7.migrate({
      schemaVersion: 6,
      quarantine: {
        crops: [{ tile: 70, cropId: 'mod:moon_wheat', plantedTick: 5 }],
        buildings: [{ building: { id: 9, tile: 130, buildingId: 'mod:moon_shed' }, stacks: [] }],
        stacks: [],
        lastPlanted: [{ tile: 64, cropId: 'mod:moon_wheat' }],
      },
    }) as unknown as SaveDocument;

    // (x 6, y 1) → 1·80+6; (x 2, y 2) → 2·80+2; (x 0, y 1) → 1·80.
    expect(document.quarantine.crops[0]?.tile).toBe(86);
    expect(document.quarantine.buildings[0]?.building.tile).toBe(162);
    expect(document.quarantine.lastPlanted[0]?.tile).toBe(80);
    expect(document.quarantine.crops[0]?.plantedTick).toBe(5);
  });

  it.each(v6Fixtures)('%s: hydrates, and the farm is where it was', (name) => {
    const world = hydrateWorld(migrated(name));

    // The fixture farm's crops were all planted west of x=64; after the
    // widening they must still be, at unchanged coordinates.
    for (const crop of world.crops.values()) {
      expect(crop.tile % WORLD_WIDTH).toBeLessThan(OLD_WIDTH);
    }
    for (const worker of world.workers.values()) {
      expect(worker.position % WORLD_WIDTH).toBeLessThan(OLD_WIDTH);
    }
  });

  it.each(v6Fixtures)('%s: a migrated farm gains the village, once, beside its own', (name) => {
    // ADR-030 §3's payoff: the save predates the town, so hydration founds it
    // — with ids continuing from the restored allocator, so nothing collides.
    const document = migrated(name);
    const world = hydrateWorld(document);

    const townIds = new Set<string>([CORE_COTTAGE, CORE_WELL, CORE_NOTICE_BOARD, CORE_CASTLE]);
    const town = [...world.buildings.values()].filter((b) => townIds.has(b.buildingId));
    const farm = [...world.buildings.values()].filter((b) => !townIds.has(b.buildingId));

    expect(town).toHaveLength(TOWN_PLACEMENTS.length);
    expect(farm.map((b) => [b.id, b.tile])).toEqual(
      document.world.buildings.map((b) => [b.id, b.tile]),
    );
    // Every town building stands east of the farm, on never-owned land.
    for (const building of town) {
      expect(building.tile % WORLD_WIDTH).toBeGreaterThanOrEqual(OLD_WIDTH);
    }
  });
});
