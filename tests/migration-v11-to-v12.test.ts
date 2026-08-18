/**
 * v11 → v12, the logistics link. Phase-26 — ADR-036, `SAVE_FORMAT.md` §9.
 *
 * Three additions, all empty or neutral: `world.routes`, `ids.route` at 1, and
 * `hauling: null` on every worker.
 *
 * The non-vacuity that matters here is the **worker mapping**. A link that
 * rewrites every entry of a collection can pass trivially over an empty one, so
 * the v11 gold is checked for workers before the claim is made — the v6→v7
 * lesson, applied to the collection this link actually touches.
 *
 * `ids.route` starting at 1 rather than 0 is not cosmetic: zero is reserved as
 * "no entity" throughout the allocator, so a counter restored at 0 would hand
 * out a first id that reads as absent.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Tile math goes through the constants, never a literal width — the v0.4
// widening broke every test that had 80 written into it (ADR-030 §Consequences).
import { WORLD_WIDTH } from '../src/shared/constants';

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
import { addRoute } from '../src/sim/commands/haul-commands';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { CORE_MILL, CORE_STORAGE_SHED } from '../src/sim/content/buildings';
import { CORE_WHEAT, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { stepSimulationBy } from '../src/sim/tick';
import { addItems, containerCount } from '../src/sim/world/container';
import { routesInOrder } from '../src/sim/world/route';
import { createWorld } from '../src/sim/world/world';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v11Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v11-'));

const META: SaveMeta = {
  gameVersion: '0.4.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_000_000_000,
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

describe('the v11 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v11Fixtures.length).toBeGreaterThan(0);
  });

  it('carries workers — the per-worker mapping must not pass vacuously', () => {
    for (const name of v11Fixtures) {
      const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
      expect(raw.world.workers.length, 'workers').toBeGreaterThan(0);
    }
  });

  it.each(v11Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v11Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v11Fixtures)('%s gains routes, a route counter, and haul state', (name) => {
    const document = migrated(name);

    expect(document.world.routes).toEqual([]);
    expect(document.world.ids.route).toBe(1);
    for (const worker of document.world.workers) {
      expect(worker.hauling).toBeNull();
    }
  });

  it.each(v11Fixtures)('%s hydrates and continues deterministically', (name) => {
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

describe('a route and a live haul survive the round trip', () => {
  it('restores the route, and the worker still knows what it is carrying', () => {
    // The reservation is DERIVED from the worker's task and `hauling` field
    // (ADR-036 as amended), so this round trip IS the reservation round trip:
    // there is no separate record to persist, and none that could be lost.
    const world = createWorld(55);
    world.wallet.coins = 1_000_000;
    const centre = 32 * WORLD_WIDTH + 32;
    expect(placeBuilding(world, centre, CORE_STORAGE_SHED).ok).toBe(true);
    const shed = [...world.buildings.keys()].at(-1)!;
    expect(placeBuilding(world, centre + 3, CORE_MILL).ok).toBe(true);
    const mill = [...world.buildings.keys()].at(-1)!;
    expect(addRoute(world, shed, mill, CORE_WHEAT).ok).toBe(true);
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT, 40, DEFAULT_STACK_SIZE);
    expect(hireWorker(world, centre + 1).ok).toBe(true);

    // Run until somebody is genuinely part-way through a haul.
    let carrier = null as ReturnType<typeof world.workers.get> | null;
    for (let i = 0; i < 2_000 && carrier == null; i += 1) {
      stepSimulationBy(world, 1);
      carrier = [...world.workers.values()].find((w) => w.hauling !== null) ?? null;
    }
    expect(carrier, 'no worker ever picked up a load').not.toBeNull();

    const restored = hydrateWorld(toSaveDocument(world, META));

    expect(routesInOrder(restored.routes)).toHaveLength(1);
    const loaded = restored.workers.get(carrier!.id)!;
    expect(loaded.hauling).toBe(carrier!.hauling);
    expect(containerCount(loaded.carrying, CORE_WHEAT)).toBe(
      containerCount(carrier!.carrying, CORE_WHEAT),
    );
  });

  it('serializes byte-identically after a round trip with a route live', () => {
    const world = createWorld(56);
    world.wallet.coins = 1_000_000;
    const centre = 32 * WORLD_WIDTH + 32;
    placeBuilding(world, centre, CORE_STORAGE_SHED);
    const shed = [...world.buildings.keys()].at(-1)!;
    placeBuilding(world, centre + 3, CORE_MILL);
    const mill = [...world.buildings.keys()].at(-1)!;
    addRoute(world, shed, mill, CORE_WHEAT);
    addItems(world.buildingStorage.get(shed)!, CORE_WHEAT, 20, DEFAULT_STACK_SIZE);
    hireWorker(world, centre + 1);
    stepSimulationBy(world, 500);

    const once = serializeSave(toSaveDocument(world, META));
    const twice = serializeSave(toSaveDocument(hydrateWorld(toSaveDocument(world, META)), META));

    expect(twice).toBe(once);
  });
});
