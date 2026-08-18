/**
 * v12 → v13, the second grid widening. Phase-27 — ADR-037 §1.
 *
 * 80 → 112. The link re-lays every dense array and remaps every stored tile
 * index by `remap(i) = floor(i / 80) * 112 + (i % 80)`, so **a thing at (x, y)
 * before is at (x, y) after**. That is the claim, and it is asserted by
 * position rather than by count: a link that dropped half the farm would keep
 * the same number of crops.
 *
 * The v12 gold deliberately carries crops, buildings, workers, a route and a
 * worker part-way through a haul — the v6→v7 lesson, applied to a link whose
 * whole job is touching every one of those.
 *
 * The wilds themselves are NOT in the document and cannot be: node existence is
 * derived from a hash of (seed, tile) (ADR-037 §3). `harvestedAt` appears empty,
 * which is what "a v12 world had no wilds to have worked" looks like on disk.
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
import { WILDS_MIN_X, WORLD_WIDTH } from '../src/shared/constants';
import { stepSimulationBy } from '../src/sim/tick';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v12Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v12-'));

const OLD_WIDTH = 80;

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

/** `(x, y)` of a flat index against a given width. */
const at = (tile: number, width: number): { x: number; y: number } => ({
  x: tile % width,
  y: Math.floor(tile / width),
});

describe('the v12 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v12Fixtures.length).toBeGreaterThan(0);
  });

  it('carry crops, buildings, workers, a route and a live haul', () => {
    // A link that re-lays every tile index must be tested against a document
    // that HAS tile indices in every collection it touches.
    for (const name of v12Fixtures) {
      const before = raw(name);
      expect(before.world.crops.length, 'crops').toBeGreaterThan(0);
      expect(before.world.buildings.length, 'buildings').toBeGreaterThan(0);
      expect(before.world.workers.length, 'workers').toBeGreaterThan(0);
      expect(before.world.routes.length, 'routes').toBeGreaterThan(0);
      expect(
        before.world.workers.some((worker) => worker.hauling !== null),
        'a worker part-way through a haul',
      ).toBe(true);
    }
  });

  it.each(v12Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v12Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v12Fixtures)('%s widens the grid to the current width', (name) => {
    const after = migrated(name);
    expect(after.world.grid.width).toBe(WORLD_WIDTH);
    expect(after.world.grid.height).toBe(raw(name).world.grid.height);
  });

  it.each(v12Fixtures)('%s keeps every crop at the same (x, y)', (name) => {
    // THE claim, asserted by position. A link that dropped or shifted a row
    // would keep the same count and fail here.
    const before = raw(name);
    const after = migrated(name);

    expect(after.world.crops).toHaveLength(before.world.crops.length);
    for (const [i, crop] of before.world.crops.entries()) {
      expect(at(after.world.crops[i]!.tile, WORLD_WIDTH)).toEqual(at(crop.tile, OLD_WIDTH));
      expect(after.world.crops[i]!.cropId).toBe(crop.cropId);
    }
  });

  it.each(v12Fixtures)('%s keeps every building and worker at the same (x, y)', (name) => {
    const before = raw(name);
    const after = migrated(name);

    for (const [i, building] of before.world.buildings.entries()) {
      expect(at(after.world.buildings[i]!.tile, WORLD_WIDTH)).toEqual(at(building.tile, OLD_WIDTH));
    }
    for (const [i, worker] of before.world.workers.entries()) {
      expect(at(after.world.workers[i]!.position, WORLD_WIDTH)).toEqual(
        at(worker.position, OLD_WIDTH),
      );
    }
  });

  it.each(v12Fixtures)('%s carries the route and the live haul through untouched', (name) => {
    // Routes hold building ids, not tiles, so they must ride through unchanged
    // — and the worker's `hauling` binding must survive, or a load in transit
    // would be orphaned by the widening.
    const before = raw(name);
    const after = migrated(name);

    expect(after.world.routes).toEqual(before.world.routes);
    expect(after.world.workers.map((w) => w.hauling)).toEqual(
      before.world.workers.map((w) => w.hauling),
    );
  });

  it.each(v12Fixtures)('%s gains an empty harvestedAt', (name) => {
    expect(migrated(name).world.harvestedAt).toEqual([]);
  });

  it.each(v12Fixtures)('%s leaves the new band empty and unowned', (name) => {
    // Ownership is the whole access model (ADR-030 §1, ADR-037 §2), so the
    // wilds being unowned is what makes every farm rule decline them without
    // knowing they exist.
    const world = hydrateWorld(migrated(name));
    for (let y = 0; y < world.tiles.height; y += 7) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 5) {
        const tile = y * WORLD_WIDTH + x;
        expect(world.crops.has(tile as never), `crop at (${String(x)},${String(y)})`).toBe(false);
      }
    }
  });

  it.each(v12Fixtures)('%s hydrates and continues deterministically', (name) => {
    const document = migrated(name);
    const first = hydrateWorld(document);
    const second = hydrateWorld(document);
    stepSimulationBy(first, 200);
    stepSimulationBy(second, 200);

    expect(serializeSave(toSaveDocument(second, META))).toBe(
      serializeSave(toSaveDocument(first, META)),
    );
  });
});
