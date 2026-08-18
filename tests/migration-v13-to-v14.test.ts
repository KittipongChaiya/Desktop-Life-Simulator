/**
 * v13 → v14, expeditions. Phase-28 — ADR-038 §3.
 *
 * The smallest link in the chain: one empty collection. Which makes the risk
 * the opposite of `v12 → v13`'s — that link touched every stored tile index and
 * had to be checked for what it BROKE, while this one adds a field and has to
 * be checked for what it might have DROPPED on the way past.
 *
 * So the v13 gold deliberately carries crops, buildings, workers, a route, a
 * worker part-way through a haul, and a worked wild tile — v13's own new field
 * — and every one is asserted through the migration. A fixture that carried
 * none of it would pass any link ever written (the v6→v7 lesson).
 *
 * "Empty is EXACT, not a default" is the other claim worth a test: a v13 world
 * had no way to send anyone anywhere, so an empty table is the true state of
 * that save rather than a safe guess about it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  type SaveDocument,
  type SaveMeta,
} from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { stepSimulationBy } from '../src/sim/tick';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v13Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v13-'));

const META: SaveMeta = {
  gameVersion: '0.4.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_000_000_000,
  playtimeTicks: 0,
  saveCount: 1,
};

function raw(name: string): SaveDocument {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
}

function migrated(name: string): SaveDocument {
  const run = runMigrations(
    JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number },
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
  );
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v13 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v13Fixtures.length).toBeGreaterThan(0);
  });

  it('carry crops, buildings, workers, a route, a live haul and a worked wild tile', () => {
    // The fixture's own contents are the test's premise. Asserted, because a
    // gold that quietly emptied would make every claim below vacuous.
    for (const name of v13Fixtures) {
      const before = raw(name);
      expect(before.world.crops.length, 'crops').toBeGreaterThan(0);
      expect(before.world.buildings.length, 'buildings').toBeGreaterThan(0);
      expect(before.world.workers.length, 'workers').toBeGreaterThan(0);
      expect(before.world.routes.length, 'routes').toBeGreaterThan(0);
      expect(before.world.harvestedAt.length, 'harvestedAt').toBeGreaterThan(0);
      expect(
        before.world.workers.some((worker) => worker.hauling !== null),
        'a worker part-way through a haul',
      ).toBe(true);
    }
  });

  it.each(v13Fixtures)('%s has no expedition table before the link', (name) => {
    expect((raw(name).world as Record<string, unknown>)['expeditions']).toBeUndefined();
  });

  it.each(v13Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v13Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const parsed = parseSaveDocument(migrated(name));
    expect(parsed.ok).toBe(true);
    expect(repairSaveDocument(migrated(name), coreContent()).repairs).toEqual([]);
  });

  it.each(v13Fixtures)('%s arrives with an empty expedition table', (name) => {
    // EXACT, not a default: a v13 world had no way to send anyone anywhere.
    expect(migrated(name).world.expeditions).toEqual([]);
  });

  it.each(v13Fixtures)('%s keeps every crop, building, worker and route', (name) => {
    const before = raw(name);
    const after = migrated(name);

    expect(after.world.crops).toEqual(before.world.crops);
    expect(after.world.buildings).toEqual(before.world.buildings);
    expect(after.world.workers).toEqual(before.world.workers);
    expect(after.world.routes).toEqual(before.world.routes);
  });

  it.each(v13Fixtures)('%s keeps the wilds it had already worked', (name) => {
    // v13's own new field, one link older. A link that dropped it would give
    // the player back a wilderness that had regrown while they were gone —
    // which is generous rather than harmful, and still wrong.
    expect(migrated(name).world.harvestedAt).toEqual(raw(name).world.harvestedAt);
  });

  it.each(v13Fixtures)('%s hydrates into a world with nobody away', (name) => {
    const parsed = parseSaveDocument(migrated(name));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    const world = hydrateWorld(parsed.value);

    expect(world.expeditions.size).toBe(0);
    expect(world.crops.size).toBeGreaterThan(0);
  });

  it.each(v13Fixtures)('%s continues deterministically after loading', (name) => {
    const load = (): ReturnType<typeof hydrateWorld> => {
      const parsed = parseSaveDocument(migrated(name));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error('unreachable');
      return hydrateWorld(parsed.value);
    };

    const first = load();
    const second = load();
    stepSimulationBy(first, 300);
    stepSimulationBy(second, 300);

    expect(serializeSave(toSaveDocument(first, META))).toBe(
      serializeSave(toSaveDocument(second, META)),
    );
  });
});
