/**
 * v8 → v9, the exploit-fix link. Phase-20 — ADR-032 §2 as amended,
 * `SAVE_FORMAT.md` §9.
 *
 * The phase's second link, and the reason is recorded in `v8-to-v9.ts`: v8
 * merged, then live verification caught that deleting a contract on delivery
 * dropped the double-acceptance guard with it. Every v8 contract migrates to
 * `fulfilledTick: null` — a delivered contract could not exist in a v8 save.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import '../plugins/core';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { v8ToV9 } from '../src/persistence/migrations/v8-to-v9';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v8Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v8-'));

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v8 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v8Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v8Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v8Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v8Fixtures)('%s keeps every world field except what later links declare', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
    const after = migrated(name);

    for (const [key, value] of Object.entries(before.world)) {
      // v13 (ADR-037) re-lays every tile index for the second grid widening,
      // so the collections holding one legitimately change. Declared, not
      // exempted: `migration-v12-to-v13.test.ts` asserts each survives at the
      // same (x, y), which is a stronger claim than byte-identity ever was.
      if (['grid', 'crops', 'buildings', 'workers', 'lastPlanted'].includes(key)) continue;
      // v12 (ADR-036) adds `hauling` to every worker and `route` to the id
      // counters. Declared here rather than weakening the comparison: this test
      // asserts a link changes nothing it did not mean to, and a later link
      // legitimately touching a collection is exactly what the skip list is for.
      if (key === 'workers' || key === 'ids') continue;
      // contracts: this link's own change. contractStats: v10 adds the empty
      // byRequester map (ADR-034 §4) — asserted below rather than exempted.
      if (key === 'contracts' || key === 'contractStats') continue;
      expect(
        JSON.stringify((after.world as unknown as Record<string, unknown>)[key]),
        `world.${key} changed`,
      ).toBe(JSON.stringify(value));
    }
    expect(after.world.contractStats).toEqual({
      ...before.world.contractStats,
      byRequester: {},
    });
    expect(after.world.quests).toEqual({});
  });
});

describe('the link itself', () => {
  it('marks every contract open — a v8 save cannot hold a delivered one', () => {
    const document = v8ToV9.migrate({
      schemaVersion: 8,
      world: {
        contracts: [
          {
            offerId: 14,
            item: 'core:turnip',
            quantity: 40,
            rewardCoins: 600,
            deadlineTick: 72_000,
            requester: 'core:resident_marla',
            acceptedTick: 9_001,
          },
        ],
      },
    }) as unknown as SaveDocument;

    expect(document.world.contracts[0]?.fulfilledTick).toBeNull();
    expect(document.world.contracts[0]?.rewardCoins).toBe(600);
  });
});
