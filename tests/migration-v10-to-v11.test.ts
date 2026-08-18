/**
 * v10 → v11, the factory link. Phase-25 — ADR-035, `SAVE_FORMAT.md` §9.
 *
 * What the link must hold: an empty `factories` collection appears, and
 * absolutely nothing else moves. A v10 world had no building any recipe could
 * name, so there is no production state to reconstruct and none to invent.
 *
 * ## Where the non-vacuity actually lives, for this link
 *
 * The v6→v7 lesson was that a fixture must CARRY the data a link transforms,
 * or the test passes over an empty case. This link transforms nothing, so
 * carrying data proves a different thing: that a rich v10 world — four
 * buildings, two storage containers, two contracts, twenty-four crops, three
 * workers — rides through with every byte intact except the one added key.
 * That is the claim worth pinning here, and the fixture is checked for those
 * contents before the claim is made.
 *
 * The risk this link genuinely introduces is not in the link. It is in
 * serialization: a factory mid-craft must come back as the same factory,
 * mid-the-same-craft, completing on the same tick. That is the last section.
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
import { CORE_MILL } from '../src/sim/content/buildings';
import { CORE_FLOUR, CORE_WHEAT, DEFAULT_STACK_SIZE } from '../src/sim/content/items';
import { CORE_GRIND_FLOUR } from '../src/sim/content/recipes';
import { setFactoryRecipe } from '../src/sim/commands/factory-commands';
import { placeBuilding } from '../src/sim/commands/building-commands';
import { addItems, containerCount } from '../src/sim/world/container';
import { createWorld } from '../src/sim/world/world';

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');
const v10Fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith('v10-'));

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

describe('the v10 golden fixtures', () => {
  it('finds the fixtures this test exists to check', () => {
    expect(v10Fixtures.length).toBeGreaterThan(0);
  });

  it('the fixture carries a real farm — the preservation claim must not pass vacuously', () => {
    for (const name of v10Fixtures) {
      const raw = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as SaveDocument;
      expect(raw.world.buildings.length, 'buildings').toBeGreaterThan(0);
      expect(raw.world.buildingStorage.length, 'storage').toBeGreaterThan(0);
      expect(raw.world.crops.length, 'crops').toBeGreaterThan(0);
      expect(raw.world.workers.length, 'workers').toBeGreaterThan(0);
    }
  });

  it.each(v10Fixtures)('%s migrates to the current version', (name) => {
    expect(migrated(name).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each(v10Fixtures)('%s validates and needs ZERO repairs', (name) => {
    const document = migrated(name);
    expect(parseSaveDocument(document).ok).toBe(true);
    expect(repairSaveDocument(document, coreContent()).repairs).toEqual([]);
  });

  it.each(v10Fixtures)('%s gains an empty factory table and nothing else', (name) => {
    const before = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as {
      world: Record<string, unknown>;
    };
    const after = migrated(name);

    expect(after.world.factories).toEqual([]);
    // Every other key rides through byte-identical. Compared as JSON so a
    // reordered array or a changed number is caught, not just a missing key.
    for (const [key, value] of Object.entries(before.world)) {
      // v12 (ADR-036) adds `hauling` to every worker and `route` to the id
      // counters. Declared here rather than weakening the comparison: this test
      // asserts a link changes nothing it did not mean to, and a later link
      // legitimately touching a collection is exactly what the skip list is for.
      if (key === 'workers' || key === 'ids') continue;
      expect(JSON.stringify((after.world as unknown as Record<string, unknown>)[key]), key).toBe(
        JSON.stringify(value),
      );
    }
  });

  it.each(v10Fixtures)('%s hydrates and continues deterministically', (name) => {
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

describe('a factory survives the round trip mid-craft', () => {
  /** A world with a mill grinding, one craft already under way. */
  function millMidCraft(): { world: ReturnType<typeof createWorld>; building: number } {
    const world = createWorld(99);
    world.wallet.coins = 100_000;
    const tile = 32 * 80 + 32;
    expect(placeBuilding(world, tile, CORE_MILL).ok).toBe(true);
    const building = [...world.buildings.keys()].at(-1)!;

    expect(setFactoryRecipe(world, building, CORE_GRIND_FLOUR).ok).toBe(true);
    addItems(world.factories.get(building)!.input, CORE_WHEAT, 6, DEFAULT_STACK_SIZE);

    // Run far enough that a craft is genuinely in flight.
    stepSimulationBy(world, 100);
    expect(world.factories.get(building)!.startedTick).not.toBeNull();
    return { world, building };
  }

  it('comes back as the same factory, mid the same craft', () => {
    const { world, building } = millMidCraft();
    const before = world.factories.get(building)!;

    const restored = hydrateWorld(toSaveDocument(world, META));
    const after = restored.factories.get(building);

    expect(after).toBeDefined();
    expect(after?.recipeId).toBe(before.recipeId);
    expect(after?.startedTick).toBe(before.startedTick);
    expect(after?.replanTick).toBe(before.replanTick);
    expect(containerCount(after!.input, CORE_WHEAT)).toBe(containerCount(before.input, CORE_WHEAT));
  });

  it('finishes that craft on exactly the tick it would have', () => {
    // The whole point of persisting `startedTick` rather than a progress bar:
    // completion is `startedTick + craftTicks` either side of a save.
    const { world, building } = millMidCraft();
    const restored = hydrateWorld(toSaveDocument(world, META));

    stepSimulationBy(world, 1_300);
    stepSimulationBy(restored, 1_300);

    const live = world.factories.get(building)!;
    const loaded = restored.factories.get(building)!;
    expect(containerCount(loaded.output, CORE_FLOUR)).toBe(containerCount(live.output, CORE_FLOUR));
    expect(containerCount(loaded.output, CORE_FLOUR)).toBeGreaterThan(0);
  });

  it('serializes byte-identically after a round trip', () => {
    const { world } = millMidCraft();
    const once = serializeSave(toSaveDocument(world, META));
    const twice = serializeSave(toSaveDocument(hydrateWorld(toSaveDocument(world, META)), META));

    expect(twice).toBe(once);
  });
});
