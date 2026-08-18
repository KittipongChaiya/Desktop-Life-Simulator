/**
 * v3 → v4, against a real save. Phase-11a — `SAVE_FORMAT.md` §9, §10.
 *
 * The golden fixture is a v2 fixture carried forward exactly one link, which is
 * the route a real v3 save took.
 *
 * Two things are worth more than the rest of this file:
 *
 * 1. **The migration is a pure function of the document.** It writes a frozen
 *    literal season list rather than reading the installed registry, so the
 *    same save migrates identically on a machine with a season mod and one
 *    without. A test below breaks if that changes.
 * 2. **The constants are exercised at NON-DEFAULT values.** Phase-10b's
 *    offline-exactness test passed for weeks against a `deserialize` that
 *    dropped `ticksPerDay` entirely, because the fallback supplied the very
 *    value it asserted. A persisted constant tested at its default is not
 *    tested at all.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { DEFAULT_DAYS_PER_SEASON } from '../src/shared/constants';
import { seasonFor, seasonIndexFor } from '../src/sim/time/game-clock';
import { createWorld } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v3Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v3-'));

const META: SaveMeta = {
  gameVersion: '0.2.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v3 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v3Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v3Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v3Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v3Fixtures)('%s freezes the season length and the year order', (name) => {
    const world = migrated(name).world;
    expect(world.daysPerSeason).toBe(DEFAULT_DAYS_PER_SEASON);
    expect(world.seasons).toEqual(['core:spring', 'core:summer', 'core:autumn', 'core:winter']);
  });

  it.each(v3Fixtures)('%s keeps every field it already had', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as {
      world: Record<string, unknown>;
    };
    const after = migrated(name).world as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(before.world)) {
      // v12 (ADR-036) adds `hauling` to every worker and `route` to the id
      // counters. Declared here rather than weakening the comparison: this test
      // asserts a link changes nothing it did not mean to, and a later link
      // legitimately touching a collection is exactly what the skip list is for.
      if (key === 'workers' || key === 'ids') continue;
      // `grid` is exempt from phase-12b: `v4 → v5` REMOVES `grid.moisture`,
      // which is the chain's first removal and the one thing a
      // preserves-everything assertion cannot also claim. What the grid keeps
      // is asserted field by field in `migration-v4-to-v5.test.ts`.
      if (key === 'grid') continue;
      // `workers` is exempt from phase-14b for the mirror reason: `v5 → v6`
      // ADDS a schedule to every worker, so the array's elements changed
      // shape. What each worker keeps is asserted in
      // `migration-v5-to-v6.test.ts`, which checks the schedule is `{}` and
      // reads the rest field by field.
      if (key === 'workers') continue;
      // `crops`, `buildings`, and `lastPlanted` are exempt from phase-18:
      // `v6 → v7` widens the grid and re-lays every stored tile index
      // (ADR-030 §2). That places survive — same (x, y), new index — is
      // asserted field by field in `migration-v6-to-v7.test.ts`.
      if (key === 'crops' || key === 'buildings' || key === 'lastPlanted') continue;
      expect(JSON.stringify(after[key]), `${name}: world.${key} changed`).toBe(
        JSON.stringify(value),
      );
    }
  });

  it.each(v3Fixtures)('%s migrates identically when run twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });
});

describe('the migration is a pure function of the document', () => {
  it('writes the season order that SHIPPED, not the one installed today', () => {
    // If a content source adds a fifth season, this must not change: the link
    // describes what a v3 world was. Updating this list to match new content
    // would make the same save migrate differently on two machines — and would
    // silently rewrite the year of every v3 save still in the wild.
    const world = migrated(v3Fixtures[0] as string).world;

    expect(world.seasons).toHaveLength(4);
    expect(world.seasons[0]).toBe('core:spring');
    expect(world.seasons[3]).toBe('core:winter');
  });
});

describe('the frozen year is what the derivation reads', () => {
  it('reads the season from the migrated world, not a global', () => {
    const world = migrated(v3Fixtures[0] as string).world;
    const day = 9; // Into the second season under a 7-day default.

    expect(seasonFor(day, world.daysPerSeason, world.seasons)).toBe('core:summer');
  });

  it('would renumber the past if the length changed — which is why it is stored', () => {
    const world = migrated(v3Fixtures[0] as string).world;

    // Day 30 is the SECOND year's spring under a 7-day season (a 28-day year)
    // and autumn under a 15-day one. A rebalance reaching existing worlds
    // would move the player from one to the other with no warning.
    expect(seasonFor(30, world.daysPerSeason, world.seasons)).toBe('core:spring');
    expect(seasonFor(30, 15, world.seasons)).toBe('core:autumn');
  });
});

describe('the constants survive a round-trip at NON-DEFAULT values', () => {
  it('restores a season length no default would supply', () => {
    // Built with 3 days a season and a two-season year: if `deserialize`
    // dropped either field, the fallback would supply the default and this
    // would still pass at 7/4. That is the trap phase-10b fell into.
    const world = createWorld(21, {
      daysPerSeason: 3,
      seasons: ['core:summer', 'core:winter'],
    });

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    expect(loaded.daysPerSeason).toBe(3);
    expect(loaded.seasons).toEqual(['core:summer', 'core:winter']);
  });

  it('keeps a two-season world on its own year after the round-trip', () => {
    const world = createWorld(21, {
      daysPerSeason: 3,
      seasons: ['core:summer', 'core:winter'],
    });
    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    // Day 4 is the second season of a 3-day, two-season year — and the FIRST
    // season of the shipped one. The two answers differ, which is the point.
    expect(seasonFor(4, loaded.daysPerSeason, loaded.seasons)).toBe('core:winter');
    expect(seasonIndexFor(4, DEFAULT_DAYS_PER_SEASON, 4)).toBe(0);
  });
});
