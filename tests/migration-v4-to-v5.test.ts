/**
 * v4 → v5, the chain's first REMOVAL. Phase-12b — `SAVE_FORMAT.md` §9, §11.2.
 *
 * `grid.moisture` was persisted from version 1, serialized, validated, and read
 * by nothing — written for a moisture model ADR-009 deferred and never built.
 * So this link drops an array of zeros rather than discarding player value, and
 * that distinction is the whole test for whether a removal is safe.
 *
 * What replaces it is a different SHAPE, not a renamed field: `moisture` was a
 * 0–100 level (an accumulator); `wateredAt` is a recorded tick, like `tilledAt`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeUint32 } from '../src/persistence/base64';
import { hydrateWorld } from '../src/persistence/deserialize';
import { runMigrations } from '../src/persistence/migrate';
import { MIGRATIONS } from '../src/persistence/migrations';
import { v4ToV5 } from '../src/persistence/migrations/v4-to-v5';
import { CURRENT_SCHEMA_VERSION, type SaveDocument } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from '../src/persistence/validate';
import { DEFAULT_TICKS_PER_WEATHER_PERIOD } from '../src/shared/constants';
import { createWorld } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v4Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v4-'));

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

/**
 * THIS link's output alone — v5, not current. The removal tests describe what
 * `v4 → v5` does, and asserting that through the full chain stopped being
 * possible when `v6 → v7` re-laid the grid it had just checked byte-for-byte
 * (ADR-030 §2). The full-chain properties stay covered by the fixture tests
 * above; these apply one pure link to one document, which is what a link is.
 */
function afterThisLink(name: string): SaveDocument {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
  return v4ToV5.migrate(raw as never) as unknown as SaveDocument;
}

describe('the v4 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v4Fixtures.length).toBeGreaterThan(0);
  });

  it.each(v4Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v4Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v4Fixtures)('%s migrates identically when run twice', (name) => {
    expect(JSON.stringify(migrated(name))).toBe(JSON.stringify(migrated(name)));
  });
});

describe('the removal', () => {
  it.each(v4Fixtures)('%s no longer carries moisture at all', (name) => {
    // Not "moisture is empty" — GONE. A field left behind as an empty string
    // is the shape of a migration that lost its nerve.
    const grid = migrated(name).world.grid as unknown as Record<string, unknown>;

    expect(Object.keys(grid)).not.toContain('moisture');
  });

  it.each(v4Fixtures)('%s gained a wateredAt of the right size, all zero', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as {
      world: { grid: { width: number; height: number } };
    };
    const grid = afterThisLink(name).world.grid;
    const watered = decodeUint32(grid.wateredAt);

    expect(watered.length).toBe(before.world.grid.width * before.world.grid.height);
    // Every tile is "never watered", which is exactly true: a v4 world had
    // nothing to water with.
    expect(watered.every((value) => value === 0)).toBe(true);
  });

  it.each(v4Fixtures)('%s keeps every other grid field byte-for-byte', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as {
      world: { grid: Record<string, unknown> };
    };
    const after = afterThisLink(name).world.grid as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(before.world.grid)) {
      if (key === 'moisture') continue;
      expect(JSON.stringify(after[key]), `grid.${key} changed`).toBe(JSON.stringify(value));
    }
  });

  it.each(v4Fixtures)('%s freezes the weather period', (name) => {
    expect(migrated(name).world.ticksPerWeatherPeriod).toBe(DEFAULT_TICKS_PER_WEATHER_PERIOD);
  });

  it('sizes wateredAt from the DOCUMENT, not from the current world', () => {
    // A migration describes the save it was handed. If the world size ever
    // changes, an old save must not be retro-resized into a different farm.
    const raw = JSON.parse(readFileSync(join(FIXTURES, v4Fixtures[0] as string), 'utf8')) as {
      world: { grid: Record<string, unknown> };
      schemaVersion: number;
    };
    raw.world.grid['width'] = 4;
    raw.world.grid['height'] = 4;

    const grid = (v4ToV5.migrate(raw) as unknown as SaveDocument).world.grid;
    expect(decodeUint32(grid.wateredAt).length).toBe(16);
  });
});

describe('the weather period survives a round-trip at a NON-DEFAULT value', () => {
  it('restores a period length no default would supply', () => {
    // Built with the default this passes even if `deserialize` drops the
    // field. 900 ticks is a period nothing else produces.
    const world = createWorld(31, { ticksPerWeatherPeriod: 900 });
    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    expect(loaded.ticksPerWeatherPeriod).toBe(900);
  });

  it('round-trips wateredAt, which moisture never had to', () => {
    const world = createWorld(31);
    world.tiles.wateredAt[100] = 12_345;
    world.tiles.wateredAt[4095] = 6;

    const loaded = hydrateWorld(JSON.parse(serializeSave(toSaveDocument(world, META))) as never);

    expect(loaded.tiles.wateredAt[100]).toBe(12_345);
    expect(loaded.tiles.wateredAt[4095]).toBe(6);
  });
});
