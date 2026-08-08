/**
 * The isolation invariant, against a real second source. Phase-09 — ADR-026 §3.
 *
 * > **Removing a content source may affect only entities, containers,
 * > side-tables, and save partitions whose `ContentId` lies in a namespace that
 * > source owns. Nothing else in the save may change.**
 *
 * ADR-026 states it as one sentence "because it is meant to be a test". This is
 * that test, and it is the reason the whole content-identity model exists:
 * uninstalling a plugin must not destroy the farm built with it, and must not
 * touch the farm built beside it.
 *
 * The fixture source is deliberately NOT a mock. `moonmelon` declares a crop and
 * an item in its own namespace and registers them through the same public API
 * `plugins/core/` uses — if a shortcut existed, this file could not be written
 * the way it is.
 *
 * Removal is modelled the way it actually happens: the save is unchanged on
 * disk, and the CONTENT SET the validator is given no longer contains the
 * source. That is precisely what an uninstall looks like from persistence's
 * side — the file still references `moonmelon:melon`, and nothing knows what
 * that is any more.
 */

import { describe, expect, it } from 'vitest';

import { asTileIndex, type ContentId } from '../src/shared/ids';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { coreContent, repairSaveDocument, type KnownContent } from '../src/persistence/validate';
import { CORE_WHEAT } from '../src/sim/content/crops';
import { createInstalledRegistries } from '../src/sim/content/installed';
import { createPluginApi } from '../src/sim/content/plugin-api';
import { Provenance, type ContentSource } from '../src/sim/content/sources';
import { addItems } from '../src/sim/world/container';
import { setOwned } from '../src/sim/world/tile-grid';
import { createWorld, type World } from '../src/sim/world/world';

import type { SaveDocument, SaveMeta } from '../src/persistence/schema';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const MOONMELON_SOURCE: ContentSource = {
  id: 'moonmelon',
  namespaces: ['moonmelon'],
  provenance: Provenance.ThirdParty,
  displayName: 'Moon Melons',
  version: '1.0.0',
};

const MELON = 'moonmelon:melon' as ContentId;
const MELON_TILE = asTileIndex(2080);
const WHEAT_TILE = asTileIndex(2081);

/** The fixture source's content, registered through the public API. */
function installMoonmelon(world: World): void {
  const api = createPluginApi(MOONMELON_SOURCE, {
    crops: world.cropRegistry,
    items: world.itemRegistry,
    buildings: world.buildingRegistry,
    tileKinds: world.tileKinds,
  });

  const registered = api.registerContent({
    crops: [
      {
        id: MELON,
        displayName: 'Moon Melon',
        growthTicks: 1_800,
        yieldItem: MELON,
        yieldQuantity: 1,
        sprite: 'crops:moon_melon',
        seasons: [],
        tags: ['gourd'],
      },
    ],
    items: [{ id: MELON, displayName: 'Moon Melon', sprite: 'items:moon_melon', basePrice: 12 }],
  });

  expect(registered.ok, 'the fixture source must register through the public API').toBe(true);
}

/** A world holding one core crop and one from the second source. */
function farmWithBothSources(): World {
  const world = createWorld(7);
  installMoonmelon(world);

  for (const tile of [MELON_TILE, WHEAT_TILE]) setOwned(world.tiles, tile, true);
  world.crops.set(MELON_TILE, { cropId: MELON, tile: MELON_TILE, plantedTick: 0 });
  world.crops.set(WHEAT_TILE, { cropId: CORE_WHEAT, tile: WHEAT_TILE, plantedTick: 0 });

  addItems(world.inventory, MELON, 5, 99);
  addItems(world.inventory, CORE_WHEAT, 7, 99);
  world.lastPlanted.set(MELON_TILE, MELON);
  world.lastPlanted.set(WHEAT_TILE, CORE_WHEAT);

  return world;
}

/** The content set as it looks once `moonmelon` is uninstalled. */
const withoutMoonmelon = (): KnownContent => coreContent();

/** The content set with the source present again. */
function withMoonmelon(): KnownContent {
  const registries = createInstalledRegistries();
  const api = createPluginApi(MOONMELON_SOURCE, registries);
  api.registerContent({
    crops: [
      {
        id: MELON,
        displayName: 'Moon Melon',
        growthTicks: 1_800,
        yieldItem: MELON,
        yieldQuantity: 1,
        sprite: 'crops:moon_melon',
        seasons: [],
        tags: ['gourd'],
      },
    ],
    items: [{ id: MELON, displayName: 'Moon Melon', sprite: 'items:moon_melon', basePrice: 12 }],
  });

  const walkable = new Set<number>();
  for (const kind of registries.tileKinds.all()) {
    if (kind.walkable) walkable.add(registries.tileKinds.indexOf(kind.id));
  }

  return {
    hasCrop: (id) => registries.crops.has(id as ContentId),
    hasItem: (id) => registries.items.has(id as ContentId),
    buildings: registries.buildings,
    walkableKindIndexes: walkable,
  };
}

const saved = (): SaveDocument =>
  JSON.parse(serializeSave(toSaveDocument(farmWithBothSources(), META))) as SaveDocument;

describe('a second source loads and is saved like any other', () => {
  it('registers its content through the public API and plants in the world', () => {
    const world = farmWithBothSources();
    expect(world.cropRegistry.has(MELON)).toBe(true);
    expect(world.crops.get(MELON_TILE)?.cropId).toBe(MELON);
  });

  it('writes its content into the save alongside core content', () => {
    const document = saved();
    expect(document.world.crops.map((crop) => crop.cropId)).toContain(MELON);
    expect(document.world.inventory.some((stack) => stack.item === MELON)).toBe(true);
  });
});

describe('removing a source isolates its content, and touches nothing else', () => {
  it('quarantines every entity in the removed namespace rather than deleting it', () => {
    const { document, repairs } = repairSaveDocument(saved(), withoutMoonmelon());

    expect(document.world.crops.some((crop) => crop.cropId === MELON)).toBe(false);
    expect(document.quarantine.crops.some((crop) => crop.cropId === MELON)).toBe(true);
    expect(document.quarantine.stacks.some((entry) => entry.stack.item === MELON)).toBe(true);
    expect(document.quarantine.lastPlanted.some((entry) => entry.cropId === MELON)).toBe(true);
    expect(repairs.length).toBeGreaterThan(0);
  });

  it('leaves EVERY other namespace byte-identical — the invariant itself', () => {
    const before = saved();
    const { document: after } = repairSaveDocument(before, withoutMoonmelon());

    const coreOnly = (doc: SaveDocument) =>
      JSON.stringify({
        crops: doc.world.crops.filter((crop) => crop.cropId.startsWith('core:')),
        inventory: doc.world.inventory.filter((stack) => stack.item.startsWith('core:')),
        lastPlanted: doc.world.lastPlanted.filter((entry) => entry.cropId.startsWith('core:')),
        buildings: doc.world.buildings,
        workers: doc.world.workers,
        wallet: doc.world.wallet,
        economy: doc.world.economy,
        grid: doc.world.grid,
        ids: doc.world.ids,
      });

    expect(coreOnly(after)).toBe(coreOnly(before));
  });

  it('does not touch the tick, the seed, or the RNG state', () => {
    const before = saved();
    const { document: after } = repairSaveDocument(before, withoutMoonmelon());

    expect(after.world.tick).toBe(before.world.tick);
    expect(after.world.seed).toBe(before.world.seed);
    expect(after.world.rngState).toEqual(before.world.rngState);
  });

  it('is stable when repeated — a second load with the source still absent changes nothing', () => {
    const once = repairSaveDocument(saved(), withoutMoonmelon()).document;
    const twice = repairSaveDocument(once, withoutMoonmelon()).document;
    expect(serializeSave(twice)).toBe(serializeSave(once));
  });
});

describe('re-adding the source restores what was held', () => {
  it('returns the crops, the stacks, and the planting memory', () => {
    const removed = repairSaveDocument(saved(), withoutMoonmelon()).document;
    const { document: restored } = repairSaveDocument(removed, withMoonmelon());

    expect(restored.world.crops.some((crop) => crop.cropId === MELON)).toBe(true);
    expect(restored.quarantine.crops).toEqual([]);
    expect(restored.world.inventory.some((stack) => stack.item === MELON)).toBe(true);
    expect(restored.world.lastPlanted.some((entry) => entry.cropId === MELON)).toBe(true);
  });

  it('round-trips through absence: the farm returns to what it was', () => {
    // ADR-026 §Validation's "round-trip through absence": save with a source,
    // remove it, load, save, restore it, load — the world equals the original.
    const original = saved();
    const removed = repairSaveDocument(original, withoutMoonmelon()).document;
    const restored = repairSaveDocument(removed, withMoonmelon()).document;

    expect(restored.world.crops.map((c) => c.cropId).sort()).toEqual(
      original.world.crops.map((c) => c.cropId).sort(),
    );
    expect(restored.world.inventory.map((s) => s.item).sort()).toEqual(
      original.world.inventory.map((s) => s.item).sort(),
    );
  });
});
