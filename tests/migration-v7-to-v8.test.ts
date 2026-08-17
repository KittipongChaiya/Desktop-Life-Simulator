/**
 * v7 → v8, the contract link. Phase-20 — ADR-032 §2, `SAVE_FORMAT.md` §9.
 *
 * The whole link is two explicit defaults: an empty contract store (no
 * pre-v8 save can have accepted one — the mechanic did not exist) and
 * zeroed counters. What the tests pin beyond that is the round trip: a world
 * that HOLDS a contract keeps it byte-exactly, because the record is money
 * the player is owed.
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
import { asContentId } from '../src/shared/ids';
import { createWorld } from '../src/sim/world/world';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v7Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v7-'));

const META: SaveMeta = {
  gameVersion: '0.3.0-dev',
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

describe('the v7 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v7Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v7Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v7Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v7Fixtures)('%s gains an empty store and zero counters through the chain', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
    const after = migrated(name);

    expect(after.world.contracts).toEqual([]);
    // byRequester arrived with v10 (ADR-034 §4), empty like the counters.
    expect(after.world.contractStats).toEqual({ fulfilled: 0, expired: 0, byRequester: {} });
    // Every pre-existing world field is byte-identical.
    for (const [key, value] of Object.entries(before.world)) {
      expect(
        JSON.stringify((after.world as unknown as Record<string, unknown>)[key]),
        `world.${key} changed`,
      ).toBe(JSON.stringify(value));
    }
  });
});

describe('a held contract survives the round trip', () => {
  it('serialize → load restores the promise verbatim', () => {
    const world = createWorld(31);
    world.contracts.set(14, {
      offerId: 14,
      item: asContentId('core:turnip'),
      quantity: 40,
      rewardCoins: 600,
      deadlineTick: 72_000,
      requester: asContentId('core:resident_marla'),
      acceptedTick: 9_001,
      fulfilledTick: 12_345,
    });
    world.contractStats.fulfilled = 3;
    world.contractStats.expired = 1;
    world.contractStats.byRequester['core:resident_marla'] = 3;

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    expect(loaded.contracts.get(14)).toEqual(world.contracts.get(14));
    expect(loaded.contractStats).toEqual({
      fulfilled: 3,
      expired: 1,
      byRequester: { 'core:resident_marla': 3 },
    });
  });
});
