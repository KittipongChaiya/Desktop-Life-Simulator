/**
 * SaveDocument → World. Phase-07a — `SAVE_FORMAT.md` §4.3 steps 5, ADR-015 §6.
 *
 * Hydration reuses `createWorld` for everything that is NOT state: registries,
 * command registration, the event bus, the crop-stats subscription — all the
 * wiring a world needs regardless of where its state came from. Then every
 * authoritative field is overwritten from the document. This keeps exactly one
 * world constructor: a hydrated world differs from a fresh one only in data.
 *
 * Derived state is RECOMPUTED, never read from the document
 * (`SAVE_FORMAT.md` §2.2): the grid's `blocked` bits are rebuilt from the
 * building store, container capacities come from constants and definitions
 * (a capacity change is a content rebalance, not a migration — ADR-004 §5),
 * and snapshots repopulate on the first tick.
 *
 * This module assumes a VALID document at the current version. Structural and
 * semantic validation — and the quarantine path for unknown content — run
 * before hydration in the load pipeline (07b); a malformed document here is a
 * programming error and throws.
 */

import { asBuildingId, asContentId, asTileIndex, asWorkerId } from '../shared/ids';
import { createContainer, type Container } from '../sim/world/container';
import { setBlocked } from '../sim/world/tile-grid';
import {
  WORKER_CARRY_CAPACITY,
  type Worker,
  type WorkerState,
  type WorkerTask,
  type WorkerTaskKind,
} from '../sim/world/worker';
import { createWorld, type World, type WorldOptions } from '../sim/world/world';

import { decodeBytes, decodeUint32 } from './base64';
import type { SaveDocument, SaveStack } from './schema';

function restoreStacks(container: Container, stacks: readonly SaveStack[]): void {
  // Verbatim, order preserved — stack order is state (partial-stack top-up
  // order is behavior), so no re-sorting and no re-packing through addItems.
  container.stacks = stacks.map((stack) => ({
    item: asContentId(stack.item),
    quantity: stack.qty,
  }));
}

function copyBytes(target: Uint8Array, encoded: string, field: string): void {
  const bytes = decodeBytes(encoded);
  if (bytes.length !== target.length) {
    throw new Error(`grid ${field}: expected ${target.length} bytes, got ${bytes.length}`);
  }
  target.set(bytes);
}

/**
 * Builds a live `World` from a valid current-version document.
 *
 * The returned world continues BYTE-IDENTICALLY with the world that was
 * serialized — the ADR-007 determinism property across the disk boundary,
 * asserted by the round-trip property suite.
 */
export function hydrateWorld(document: SaveDocument, options: WorldOptions = {}): World {
  const saved = document.world;
  const world = createWorld(saved.seed, options);

  world.tick = saved.tick;
  world.rng.setState(saved.rngState);

  // Grid: the four persisted arrays copied exactly; `blocked` cleared and
  // rebuilt from the building store below (derived state, §2.2). The fresh
  // world's starting plot claim is overwritten by the saved `owned` bits.
  if (saved.grid.width !== world.tiles.width || saved.grid.height !== world.tiles.height) {
    throw new Error(
      `grid ${saved.grid.width}x${saved.grid.height} does not match the world's ` +
        `${world.tiles.width}x${world.tiles.height}`,
    );
  }
  copyBytes(world.tiles.kind, saved.grid.kind, 'kind');
  copyBytes(world.tiles.owned, saved.grid.owned, 'owned');
  copyBytes(world.tiles.moisture, saved.grid.moisture, 'moisture');
  const tilledAt = decodeUint32(saved.grid.tilledAt);
  if (tilledAt.length !== world.tiles.tilledAt.length) {
    throw new Error(`grid tilledAt: expected ${world.tiles.tilledAt.length} words`);
  }
  world.tiles.tilledAt.set(tilledAt);
  world.tiles.blocked.fill(0);

  for (const crop of saved.crops) {
    const tile = asTileIndex(crop.tile);
    world.crops.set(tile, {
      cropId: asContentId(crop.cropId),
      tile,
      plantedTick: crop.plantedTick,
    });
  }

  // Documents store workers/buildings sorted by id, which equals live Map
  // insertion order (monotonic allocator) — inserting in document order
  // reproduces live iteration order exactly.
  for (const worker of saved.workers) {
    const carrying = createContainer(WORKER_CARRY_CAPACITY, WORKER_CARRY_CAPACITY);
    restoreStacks(carrying, worker.carrying);
    let task: WorkerTask | null = null;
    if (worker.task !== null) {
      const tile = asTileIndex(worker.task.tile);
      const kind = worker.task.kind as WorkerTaskKind;
      task =
        worker.task.cropId === undefined
          ? { kind, tile }
          : { kind, tile, cropId: asContentId(worker.task.cropId) };
    }
    const record: Worker = {
      id: asWorkerId(worker.id),
      position: asTileIndex(worker.position),
      state: worker.state as WorkerState,
      task,
      path: worker.path.map(asTileIndex),
      pathCursor: worker.pathCursor,
      actionProgress: worker.actionProgress,
      energy: worker.energy,
      energyTimer: worker.energyTimer,
      carrying,
      replanTick: worker.replanTick,
    };
    world.workers.set(record.id, record);
  }

  for (const building of saved.buildings) {
    const record = {
      id: asBuildingId(building.id),
      tile: asTileIndex(building.tile),
      buildingId: asContentId(building.buildingId),
    };
    world.buildings.set(record.id, record);
    setBlocked(world.tiles, record.tile, true); // derived bits, rebuilt here
  }

  for (const storage of saved.buildingStorage) {
    const id = asBuildingId(storage.building);
    const building = world.buildings.get(id);
    if (building === undefined) {
      throw new Error(`storage for building ${storage.building}, which does not exist`);
    }
    // Capacity comes from the definition, not the document — a rebalanced
    // capacity reaches old saves without a migration (ADR-004 §5).
    const definition = world.buildingRegistry.get(building.buildingId);
    if (!definition.ok) {
      // Unknown content is 07b's quarantine path; reaching hydration with it
      // is a pipeline ordering bug.
      throw new Error(`building ${building.buildingId} is not registered`);
    }
    const container = createContainer(definition.value.storageSlots ?? 0);
    restoreStacks(container, storage.stacks);
    world.buildingStorage.set(id, container);
  }

  restoreStacks(world.inventory, saved.inventory);
  world.wallet.coins = saved.wallet.coins;

  for (const entry of saved.economy.multipliers) {
    world.economy.multipliers.set(asContentId(entry.item), entry.multiplier);
  }
  world.economy.expansionsPurchased = saved.economy.expansionsPurchased;

  world.cropStats.planted = saved.cropStats.planted;
  world.cropStats.harvested = saved.cropStats.harvested;
  world.cropStats.lastActivityTick = saved.cropStats.lastActivityTick;

  for (const entry of saved.lastPlanted) {
    world.lastPlanted.set(asTileIndex(entry.tile), asContentId(entry.cropId));
  }

  world.ids.setState({ worker: saved.ids.worker, building: saved.ids.building });

  return world;
}
