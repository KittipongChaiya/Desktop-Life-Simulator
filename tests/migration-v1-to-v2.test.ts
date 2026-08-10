/**
 * The first real migration, against real saves. Phase-09b — `ROADMAP.md` §5.
 *
 * The acceptance is stated there and is what this file asserts: **both v0.1
 * golden fixtures migrate v1 → v2 with zero repairs and continue
 * deterministically.**
 *
 * "Zero repairs" is the strong half. A migration that produced a document the
 * semantic validator then had to fix would mean the migration is incomplete and
 * the repair pass is quietly finishing its job — which works, right up until a
 * repair drops something. `SAVE_FORMAT.md` §5.2's rules exist for corrupt files
 * on real disks, not as a safety net for the migration chain.
 *
 * The fixtures are append-only (`TESTING.md` §7.2). They represent saves on real
 * players' disks; if one stops migrating, the migration is wrong, not the file.
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
import { stepSimulationBy } from '../src/sim/tick';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const META = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const v1Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v1-'));

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v1 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    // Guards the guard: an empty glob would make every case below vacuous.
    expect(v1Fixtures.length).toBeGreaterThanOrEqual(2);
  });

  it.each(v1Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v1Fixtures)('%s passes structural validation after migrating', (name) => {
    expect(parseSaveDocument(migrated(name)).ok).toBe(true);
  });

  it.each(v1Fixtures)('%s needs ZERO repairs after migrating', (name) => {
    const { repairs } = repairSaveDocument(migrated(name), coreContent());
    expect(repairs).toEqual([]);
  });

  it.each(v1Fixtures)('%s hydrates and continues deterministically', (name) => {
    const document = migrated(name);

    const first = hydrateWorld(document);
    const second = hydrateWorld(document);
    stepSimulationBy(first, 200);
    stepSimulationBy(second, 200);

    expect(serializeSave(toSaveDocument(first, META))).toBe(
      serializeSave(toSaveDocument(second, META)),
    );
  });
});

describe('what the migration adds', () => {
  it.each(v1Fixtures)('%s gains an empty source manifest, not an invented one', (name) => {
    // A v1 save carries no record of what was installed when it was written.
    // Synthesising a core entry would make the manifest state something that
    // was never recorded; the next save fills it from what is really installed.
    expect(migrated(name).world.sources).toEqual([]);
  });

  it.each(v1Fixtures)('%s gains an empty disabled set, so nothing switches off', (name) => {
    expect(migrated(name).world.disabledSources).toEqual([]);
  });

  it.each(v1Fixtures)('%s keeps every field it already had', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as {
      world: Record<string, unknown>;
    };
    const after = migrated(name).world as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(before.world)) {
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
      expect(JSON.stringify(after[key]), `${name}: world.${key} changed`).toBe(
        JSON.stringify(value),
      );
    }
  });
});

describe('migration purity (SAVE_FORMAT.md §10)', () => {
  it.each(v1Fixtures)('%s produces an identical document when migrated twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });

  it.each(v1Fixtures)('%s leaves the fixture on disk untouched', (name) => {
    const before = readFileSync(join(FIXTURES, name), 'utf8');
    migrated(name);
    expect(readFileSync(join(FIXTURES, name), 'utf8')).toBe(before);
  });

  it('is a fixed point once the document is current', () => {
    const once = migrated(v1Fixtures[0] as string);
    const twice = runMigrations(once as never, MIGRATIONS, CURRENT_SCHEMA_VERSION);

    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.value.applied).toEqual([]);
    expect(JSON.stringify(twice.value.document)).toBe(JSON.stringify(once));
  });
});
