/**
 * v2 → v3, against a real save. Phase-10b — `SAVE_FORMAT.md` §9, §10.
 *
 * The golden fixture is a v1 fixture carried forward exactly one link, which is
 * the route a real v2 save took. Hand-writing one would only prove the
 * migration agrees with whatever I typed.
 *
 * What matters here is narrower than v1 → v2's and worth stating: the calendar
 * itself is a DERIVATION and needs no migration (ADR-020 §1). What this link
 * adds is the day's LENGTH and PHASES, because both must be frozen per world —
 * change either on an existing world and every past day is silently
 * reinterpreted.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { DEFAULT_TICKS_PER_DAY } from '../src/shared/constants';
import { DAY_PHASES, dayFor, phaseFor } from '../src/sim/time/game-clock';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v2Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v2-'));

function migrated(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as { schemaVersion: number };
  const run = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  expect(run.ok, `${name} failed to migrate`).toBe(true);
  if (!run.ok) throw new Error('unreachable');
  return run.value.document as unknown as SaveDocument;
}

describe('the v2 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v2Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v2Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v2Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v2Fixtures)('%s freezes the day length and the phase set', (name) => {
    const world = migrated(name).world;
    expect(world.ticksPerDay).toBe(DEFAULT_TICKS_PER_DAY);
    expect(world.dayPhases).toEqual([...DAY_PHASES]);
  });

  it.each(v2Fixtures)('%s keeps every field it already had', (name) => {
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

  it.each(v2Fixtures)('%s migrates identically when run twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });
});

describe('the frozen day is what the calendar reads', () => {
  it('reads the day and phase from the migrated world, not a global', () => {
    // The point of freezing it (ADR-020 §2): a rebalance changing the default
    // must not renumber this save's past.
    const world = migrated(v2Fixtures[0] as string).world;
    const tick = world.tick;

    expect(dayFor(tick, world.ticksPerDay)).toBe(Math.floor(tick / world.ticksPerDay));
    expect(world.dayPhases).toContain(phaseFor(tick, world.ticksPerDay));
  });

  it('would renumber the past if the length changed — which is why it is stored', () => {
    // Stated on a tick well into the world rather than the fixture's, which is
    // 0 and would be day 0 under any length — the property is about a PLAYED
    // world, and that is exactly whose past must not move.
    const world = migrated(v2Fixtures[0] as string).world;
    const played = world.ticksPerDay * 40 + 5;

    expect(dayFor(played, world.ticksPerDay)).toBe(40);
    // Halving the day doubles the count: day 40 becomes day 80, and the
    // player's whole history reads differently.
    expect(dayFor(played, Math.floor(world.ticksPerDay / 2))).toBe(80);
  });
});
