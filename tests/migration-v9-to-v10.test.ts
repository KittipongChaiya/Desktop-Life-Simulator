/**
 * v9 → v10, the wider-board link. Phase-22 — ADR-034 §3, §6,
 * `SAVE_FORMAT.md` §9.
 *
 * What the link must hold: contract ids re-key from `day × 2 + slot` to
 * `day × 4 + slot` with every frozen term untouched, the two new stores
 * appear empty, and everything else rides through byte-identical. The v9
 * fixture deliberately CARRIES contracts (one open, one fulfilled) so the
 * re-key is exercised on gold — the v6→v7 vacuous-fixture lesson.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { v9ToV10 } from '../src/persistence/migrations/v9-to-v10';
import {
  CURRENT_SCHEMA_VERSION,
  type SaveDocument,
  type SaveMeta,
} from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { createWorld } from '../src/sim/world/world';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v9Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v9-'));

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v9 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v9Fixtures.length).toBeGreaterThan(0);
  });

  it('the fixture carries contracts — the re-key must not pass vacuously', () => {
    for (const name of v9Fixtures) {
      const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
      expect(raw.world.contracts.length).toBeGreaterThan(0);
    }
  });

  it.each(v9Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v9Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v9Fixtures)('%s re-keys ids and keeps every frozen term', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
    const after = migrated(name);

    expect(after.world.contracts).toHaveLength(before.world.contracts.length);
    for (const [i, was] of before.world.contracts.entries()) {
      const is = after.world.contracts[i];
      expect(is).toBeDefined();
      if (is === undefined) continue;
      expect(is.offerId).toBe(Math.floor(was.offerId / 2) * 4 + (was.offerId % 2));
      expect({ ...is, offerId: 0 }).toEqual({ ...was, offerId: 0 });
    }
  });

  it.each(v9Fixtures)('%s keeps every other world field byte-identical', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
    const after = migrated(name);

    for (const [key, value] of Object.entries(before.world)) {
      if (key === 'contracts' || key === 'contractStats') continue;
      expect(
        JSON.stringify((after.world as unknown as Record<string, unknown>)[key]),
        `world.${key} changed`,
      ).toBe(JSON.stringify(value));
    }
    // contractStats keeps its counters and gains only the empty map.
    expect(after.world.contractStats).toEqual({
      ...before.world.contractStats,
      byRequester: {},
    });
    expect(after.world.quests).toEqual({});
  });
});

describe('the new stores survive the round trip', () => {
  const META: SaveMeta = {
    gameVersion: '0.3.0-dev',
    createdAtUnixMs: 1_753_000_000_000,
    savedAtUnixMs: 1_753_084_800_000,
    playtimeTicks: 0,
    saveCount: 1,
  };

  it('serialize → load restores watermarks and per-requester counters', () => {
    const world = createWorld(31);
    world.contractStats.byRequester['core:resident_prue'] = 2;
    world.quests.set('core:quest_good_neighbour', 2);

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    expect(loaded.contractStats.byRequester).toEqual({ 'core:resident_prue': 2 });
    expect(loaded.quests.get('core:quest_good_neighbour')).toBe(2);
  });
});

describe('the link itself', () => {
  it('re-keys day 40, slots 0 and 1, to the four-slot scheme', () => {
    const document = v9ToV10.migrate({
      schemaVersion: 9,
      world: {
        contracts: [
          { offerId: 80, item: 'core:wheat', fulfilledTick: null },
          { offerId: 81, item: 'core:turnip', fulfilledTick: 12 },
        ],
        contractStats: { fulfilled: 1, expired: 0 },
      },
    }) as unknown as SaveDocument;

    expect(document.world.contracts.map((contract) => contract.offerId)).toEqual([160, 161]);
    expect(document.world.contractStats.byRequester).toEqual({});
    expect(document.world.quests).toEqual({});
  });

  it('day 0 ids are their own re-key — the scheme agrees where the schemes overlap', () => {
    const document = v9ToV10.migrate({
      schemaVersion: 9,
      world: { contracts: [{ offerId: 0 }, { offerId: 1 }], contractStats: {} },
    }) as unknown as SaveDocument;

    expect(document.world.contracts.map((contract) => contract.offerId)).toEqual([0, 1]);
  });
});
