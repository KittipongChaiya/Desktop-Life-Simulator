/**
 * Validation. Phase-07b — `SAVE_FORMAT.md` §5, acceptance 10, 11, 12.
 *
 * Disk is an untrusted boundary (`AI_RULES.md` §2.4). Structural validation
 * proves the document is the current shape; semantic validation proves it is
 * internally coherent, under one principle: REPAIR where unambiguous, DROP
 * where meaningless, NEVER DELETE PLAYER VALUE. Every repair is reported —
 * a save needing repairs is a defect worth investigating, not routine.
 *
 * Unknown content is QUARANTINED, not deleted (§5.3): removed from the
 * active world, preserved in the document, restored when the content
 * returns. Uninstalling a mod must not destroy the farm built with it.
 */

import { describe, expect, it } from 'vitest';

import { asTileIndex } from '../shared/ids';
import { CORE_STORAGE_SHED } from '../sim/content/buildings';
import { CORE_WHEAT } from '../sim/content/crops';
import { addItems } from '../sim/world/container';
import { setBlocked, setOwned } from '../sim/world/tile-grid';
import { createWorker } from '../sim/world/worker';
import { createWorld } from '../sim/world/world';

import type { SaveDocument, SaveMeta } from './schema';
import { serializeSave, toSaveDocument } from './serialize';
import { coreContent, parseSaveDocument, repairSaveDocument } from './validate';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

/** A small, fully valid document built through the real serializer. */
function validDocument(): SaveDocument {
  const world = createWorld(7);
  const cropTile = asTileIndex(2080);
  const shedTile = asTileIndex(2144);
  const workerTile = asTileIndex(2081);
  for (const tile of [cropTile, shedTile, workerTile]) setOwned(world.tiles, tile, true);

  world.crops.set(cropTile, { cropId: CORE_WHEAT, tile: cropTile, plantedTick: 0 });

  const shedId = world.ids.allocateBuilding();
  world.buildings.set(shedId, { id: shedId, tile: shedTile, buildingId: CORE_STORAGE_SHED });
  setBlocked(world.tiles, shedTile, true);
  const shedStorage = { stacks: [], capacity: 50 };
  addItems(shedStorage, CORE_WHEAT, 20, 99);
  world.buildingStorage.set(shedId, shedStorage);

  const worker = createWorker(world.ids.allocateWorker(), workerTile);
  addItems(worker.carrying, CORE_WHEAT, 5, 99);
  world.workers.set(worker.id, worker);

  addItems(world.inventory, CORE_WHEAT, 40, 99);
  world.lastPlanted.set(cropTile, CORE_WHEAT);

  return toSaveDocument(world, META);
}

/** Deep JSON clone — documents are JSON-shaped by construction. */
function clone(document: SaveDocument): SaveDocument {
  return JSON.parse(serializeSave(document)) as SaveDocument;
}

/** Applies a tampering function to a mutable deep clone. */
function tampered(mutate: (doc: never) => void): SaveDocument {
  const doc = clone(validDocument());
  mutate(doc as never);
  return doc;
}

const CONTENT = coreContent();

describe('parseSaveDocument (structural, §5.1)', () => {
  it('accepts a real document', () => {
    const result = parseSaveDocument(clone(validDocument()));
    expect(result.ok).toBe(true);
  });

  it('rejects non-objects and junk', () => {
    for (const junk of [null, 7, 'save', [], undefined]) {
      expect(parseSaveDocument(junk).ok).toBe(false);
    }
  });

  it('rejects a wrong or missing magic — a file without it is not a save (ADR-015 §1)', () => {
    expect(parseSaveDocument(tampered((d: { magic: string }) => (d.magic = 'other/file'))).ok).toBe(
      false,
    );
  });

  it('rejects a version that is not the current one — migration must run first', () => {
    const result = parseSaveDocument(
      tampered((d: { schemaVersion: number }) => (d.schemaVersion = 99)),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects missing or mistyped fields', () => {
    expect(
      parseSaveDocument(tampered((d: { world: { wallet?: unknown } }) => delete d.world.wallet)).ok,
    ).toBe(false);
    expect(
      parseSaveDocument(tampered((d: { world: { tick: unknown } }) => (d.world.tick = 'soon'))).ok,
    ).toBe(false);
    expect(
      parseSaveDocument(tampered((d: { world: { rngState: unknown } }) => (d.world.rngState = [1])))
        .ok,
    ).toBe(false);
  });

  it('rejects corrupt grid encodings — caught here, not as a hydration crash', () => {
    expect(
      parseSaveDocument(
        tampered((d: { world: { grid: { kind: string } } }) => (d.world.grid.kind = '!!!!')),
      ).ok,
    ).toBe(false);
    expect(
      parseSaveDocument(
        tampered(
          (d: { world: { grid: { moisture: string } } }) => (d.world.grid.moisture = 'AAAA'),
        ),
      ).ok,
    ).toBe(false); // valid base64, wrong length
  });
});

describe('repairSaveDocument (semantic, §5.2)', () => {
  it('returns a clean document untouched, with zero repairs', () => {
    const document = clone(validDocument());
    const before = serializeSave(document);
    const { document: repaired, repairs } = repairSaveDocument(document, CONTENT);
    expect(repairs).toEqual([]);
    expect(serializeSave(repaired)).toBe(before);
    expect(serializeSave(document)).toBe(before); // input never mutated
  });

  it('clamps negative coins to zero', () => {
    const doc = tampered((d: { world: { wallet: { coins: number } } }) => {
      d.world.wallet.coins = -50;
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.wallet.coins).toBe(0);
    expect(repairs.some((r) => r.rule === 'coins-negative')).toBe(true);
  });

  it('drops a crop outside the grid', () => {
    const doc = tampered((d: { world: { crops: { tile: number }[] } }) => {
      d.world.crops.push({ ...d.world.crops[0]!, tile: 99_999 });
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.crops.some((c) => c.tile === 99_999)).toBe(false);
    expect(repairs.some((r) => r.rule === 'crop-tile-out-of-bounds')).toBe(true);
  });

  it('quarantines a crop with unknown content — never deletes it (§5.3)', () => {
    const doc = tampered((d: { world: { crops: { tile: number; cropId: string }[] } }) => {
      d.world.crops.push({ tile: 3000, cropId: 'mod:moon_melon', plantedTick: 4 } as never);
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.crops.some((c) => c.cropId === 'mod:moon_melon')).toBe(false);
    expect(document.quarantine.crops).toEqual([
      { tile: 3000, cropId: 'mod:moon_melon', plantedTick: 4 },
    ]);
    expect(repairs.some((r) => r.rule === 'crop-content-unknown')).toBe(true);
  });

  it('restores a quarantined crop when its content is known and the tile is free (acceptance 12)', () => {
    const doc = tampered((d: { quarantine: { crops: unknown[] } }) => {
      d.quarantine.crops.push({ tile: 3000, cropId: CORE_WHEAT, plantedTick: 4 });
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.quarantine.crops).toEqual([]);
    expect(document.world.crops.some((c) => c.tile === 3000 && c.cropId === CORE_WHEAT)).toBe(true);
    expect(repairs.some((r) => r.rule === 'quarantine-restored')).toBe(true);
  });

  it('keeps a quarantined crop held when its tile is now occupied — restore never destroys', () => {
    const doc = tampered(
      (d: { world: { crops: { tile: number }[] }; quarantine: { crops: unknown[] } }) => {
        const occupied = d.world.crops[0]!.tile;
        d.quarantine.crops.push({ tile: occupied, cropId: CORE_WHEAT, plantedTick: 4 });
      },
    );
    const { document } = repairSaveDocument(doc, CONTENT);
    expect(document.quarantine.crops).toHaveLength(1);
  });

  it('resets an out-of-grid worker to the plot center', () => {
    const doc = tampered((d: { world: { workers: { position: number }[] } }) => {
      d.world.workers[0]!.position = 123_456;
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    const position = document.world.workers[0]!.position;
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThan(64 * 64);
    expect(repairs.some((r) => r.rule === 'worker-position-out-of-bounds')).toBe(true);
  });

  it('clears a task targeting a nonexistent tile — worker returns to idle', () => {
    const doc = tampered((d: { world: { workers: { task: unknown; state: string }[] } }) => {
      d.world.workers[0]!.task = { kind: 'harvest', tile: 99_999 };
      d.world.workers[0]!.state = 'moving';
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    const worker = document.world.workers[0]!;
    expect(worker.task).toBeNull();
    expect(worker.state).toBe('idle');
    expect(repairs.some((r) => r.rule === 'worker-task-tile-out-of-bounds')).toBe(true);
  });

  it('quarantines an unknown item wherever it is held, tagged with its owner', () => {
    const doc = tampered(
      (d: {
        world: {
          inventory: unknown[];
          workers: { id: number; carrying: unknown[] }[];
          buildingStorage: { building: number; stacks: unknown[] }[];
        };
      }) => {
        d.world.inventory.push({ item: 'mod:essence', qty: 3 });
        d.world.workers[0]!.carrying.push({ item: 'mod:essence', qty: 2 });
        d.world.buildingStorage[0]!.stacks.push({ item: 'mod:essence', qty: 9 });
      },
    );
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    const workerId = document.world.workers[0]!.id;
    const buildingId = document.world.buildingStorage[0]!.building;
    // Held in pipeline order: workers, then building storage, then inventory.
    expect(document.quarantine.stacks).toEqual([
      { owner: `worker:${workerId}`, stack: { item: 'mod:essence', qty: 2 } },
      { owner: `building:${buildingId}`, stack: { item: 'mod:essence', qty: 9 } },
      { owner: 'inventory', stack: { item: 'mod:essence', qty: 3 } },
    ]);
    expect(document.world.inventory.some((s) => s.item === 'mod:essence')).toBe(false);
    expect(repairs.filter((r) => r.rule === 'stack-content-unknown')).toHaveLength(3);
  });

  it('restores a quarantined stack to its owner — or to the inventory when the owner is gone', () => {
    const doc = tampered(
      (d: { world: { workers: { id: number }[] }; quarantine: { stacks: unknown[] } }) => {
        d.quarantine.stacks.push({
          owner: `worker:${d.world.workers[0]!.id}`,
          stack: { item: CORE_WHEAT, qty: 4 },
        });
        d.quarantine.stacks.push({ owner: 'worker:9999', stack: { item: CORE_WHEAT, qty: 6 } });
      },
    );
    const { document } = repairSaveDocument(doc, CONTENT);
    expect(document.quarantine.stacks).toEqual([]);
    const carried = document.world.workers[0]!.carrying;
    expect(carried[carried.length - 1]).toEqual({ item: CORE_WHEAT, qty: 4 });
    const inventory = document.world.inventory;
    expect(inventory[inventory.length - 1]).toEqual({ item: CORE_WHEAT, qty: 6 });
  });

  it('keeps an over-capacity inventory intact and only logs (acceptance 11)', () => {
    const doc = tampered((d: { world: { inventory: unknown[] } }) => {
      for (let i = 0; i < 60; i += 1) d.world.inventory.push({ item: CORE_WHEAT, qty: 1 });
    });
    const before = clone(doc).world.inventory.length;
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.inventory).toHaveLength(before); // NEVER deleted
    expect(repairs.some((r) => r.rule === 'inventory-over-capacity')).toBe(true);
  });

  it('quarantines an unknown building together with its storage', () => {
    const doc = tampered(
      (d: {
        world: {
          buildings: { id: number; tile: number; buildingId: string }[];
          buildingStorage: { building: number; stacks: unknown[] }[];
        };
      }) => {
        d.world.buildings.push({ id: 55, tile: 3200, buildingId: 'mod:silo' });
        d.world.buildingStorage.push({ building: 55, stacks: [{ item: CORE_WHEAT, qty: 7 }] });
      },
    );
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.buildings.some((b) => b.buildingId === 'mod:silo')).toBe(false);
    expect(document.world.buildingStorage.some((s) => s.building === 55)).toBe(false);
    expect(document.quarantine.buildings).toEqual([
      {
        building: { id: 55, tile: 3200, buildingId: 'mod:silo' },
        stacks: [{ item: CORE_WHEAT, qty: 7 }],
      },
    ]);
    expect(repairs.some((r) => r.rule === 'building-content-unknown')).toBe(true);
  });

  it('keeps a building on unowned ground and logs the anomaly (§5.2)', () => {
    const doc = tampered((d: { world: { buildings: { tile: number }[] } }) => {
      d.world.buildings[0]!.tile = 10; // far outside the owned plot
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.buildings).toHaveLength(1);
    expect(repairs.some((r) => r.rule === 'building-tile-not-owned')).toBe(true);
  });

  it('reassigns duplicate worker IDs and bumps the allocator counter', () => {
    const doc = tampered((d: { world: { workers: { id: number }[]; ids: { worker: number } } }) => {
      const twin = JSON.parse(JSON.stringify(d.world.workers[0])) as { id: number };
      d.world.workers.push(twin);
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    const ids = document.world.workers.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.world.ids.worker).toBeGreaterThan(Math.max(...ids));
    expect(repairs.some((r) => r.rule === 'worker-id-duplicate')).toBe(true);
  });

  it('bumps an allocator counter that fell below the highest used ID', () => {
    const doc = tampered((d: { world: { ids: { building: number } } }) => {
      d.world.ids.building = 1; // building id 1 exists — 1 would be reissued
    });
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.ids.building).toBe(2);
    expect(repairs.some((r) => r.rule === 'allocator-behind')).toBe(true);
  });

  it('clamps a multiplier outside its band and drops one at the cap', () => {
    const doc = tampered(
      (d: { world: { economy: { multipliers: { item: string; multiplier: number }[] } } }) => {
        d.world.economy.multipliers.push({ item: CORE_WHEAT, multiplier: 0.1 });
      },
    );
    const { document, repairs } = repairSaveDocument(doc, CONTENT);
    expect(document.world.economy.multipliers.find((m) => m.item === CORE_WHEAT)?.multiplier).toBe(
      0.5,
    );
    expect(repairs.some((r) => r.rule === 'multiplier-out-of-band')).toBe(true);
  });
});
