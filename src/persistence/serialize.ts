/**
 * World → SaveDocument. Phase-07a — `SAVE_FORMAT.md` §3, ADR-002, ADR-015 §5.
 *
 * EXPLICIT, BY HAND, ALWAYS: every persisted field is written here by name.
 * Reflective serialization is banned (`SAVE_FORMAT.md` §3.1) — an internal
 * refactor must never become an accidental schema change.
 *
 * BYTE-STABLE: object literals are constructed in the canonical key order
 * (JSON.stringify preserves insertion order for string keys) and every
 * collection is sorted by a stable key — tile index for tile-keyed stores,
 * entity ID for id-keyed ones. For workers and buildings, sorted-by-id IS the
 * live Map insertion order (the allocator is monotonic and relative order
 * survives deletion), so hydration rebuilt in this order reproduces live
 * iteration order exactly — which `economySystem`'s stall sweep depends on.
 * Container stack order is copied verbatim: it is state, not presentation
 * (partial-stack top-up order is behavior).
 *
 * PURE: no clock, no I/O. `meta` is an input — the save orchestration (07c/e)
 * owns timestamps and counters; this module owns only the mapping.
 */

import type { Container } from '../sim/world/container';
import type { World } from '../sim/world/world';

import { encodeBytes, encodeUint32 } from './base64';
import {
  CURRENT_SCHEMA_VERSION,
  EMPTY_QUARANTINE,
  SAVE_MAGIC,
  type SaveBuilding,
  type SaveBuildingStorage,
  type SaveCrop,
  type SaveDocument,
  type SaveMeta,
  type SaveQuarantine,
  type SaveStack,
  type SaveWorker,
  type SaveWorkerTask,
} from './schema';

function stacksOf(container: Container): SaveStack[] {
  return container.stacks.map((stack) => ({ item: stack.item, qty: stack.quantity }));
}

/** Codepoint comparison — deliberately not `localeCompare`, which is locale-dependent. */
function byItemId(a: { readonly item: string }, b: { readonly item: string }): number {
  return a.item < b.item ? -1 : a.item > b.item ? 1 : 0;
}

/**
 * `quarantine` is the session's held not-active data (`SAVE_FORMAT.md` §5.3)
 * — loaded with the document, carried by the save orchestration, and written
 * back on every save until the content it references returns. It is not on
 * `World` because the sim never learns saves exist (ADR-014 §3's discipline,
 * applied to persistence).
 */
export function toSaveDocument(
  world: World,
  meta: SaveMeta,
  quarantine: SaveQuarantine = EMPTY_QUARANTINE,
): SaveDocument {
  const crops: SaveCrop[] = [...world.crops.values()]
    .sort((a, b) => a.tile - b.tile)
    .map((crop) => ({ tile: crop.tile, cropId: crop.cropId, plantedTick: crop.plantedTick }));

  const workers: SaveWorker[] = [...world.workers.values()]
    .sort((a, b) => a.id - b.id)
    .map((worker) => {
      // exactOptionalPropertyTypes: `cropId` is present-or-absent, never
      // `undefined` — an absent optional must not serialize as a key.
      let task: SaveWorkerTask | null = null;
      if (worker.task !== null) {
        task =
          worker.task.cropId === undefined
            ? { kind: worker.task.kind, tile: worker.task.tile }
            : { kind: worker.task.kind, tile: worker.task.tile, cropId: worker.task.cropId };
      }
      return {
        id: worker.id,
        position: worker.position,
        state: worker.state,
        task,
        path: [...worker.path],
        pathCursor: worker.pathCursor,
        actionProgress: worker.actionProgress,
        energy: worker.energy,
        energyTimer: worker.energyTimer,
        carrying: stacksOf(worker.carrying),
        replanTick: worker.replanTick,
      };
    });

  const buildings: SaveBuilding[] = [...world.buildings.values()]
    .sort((a, b) => a.id - b.id)
    .map((building) => ({
      id: building.id,
      tile: building.tile,
      buildingId: building.buildingId,
    }));

  const buildingStorage: SaveBuildingStorage[] = [...world.buildingStorage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, container]) => ({ building: id, stacks: stacksOf(container) }));

  const allocator = world.ids.getState();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    magic: SAVE_MAGIC,
    meta: {
      gameVersion: meta.gameVersion,
      createdAtUnixMs: meta.createdAtUnixMs,
      savedAtUnixMs: meta.savedAtUnixMs,
      playtimeTicks: meta.playtimeTicks,
      saveCount: meta.saveCount,
    },
    world: {
      seed: world.seed,
      tick: world.tick,
      rngState: world.rng.getState(),
      grid: {
        width: world.tiles.width,
        height: world.tiles.height,
        kind: encodeBytes(world.tiles.kind),
        owned: encodeBytes(world.tiles.owned),
        tilledAt: encodeUint32(world.tiles.tilledAt),
        wateredAt: encodeUint32(world.tiles.wateredAt),
        // `blocked` is derived from the building store — recomputed on load,
        // never persisted (SAVE_FORMAT.md §2.2).
      },
      // Sorted by id so the document stays byte-stable regardless of load order.
      sources: [...world.sources]
        .map((source) => ({
          id: source.id,
          namespaces: [...source.namespaces],
          provenance: source.provenance,
          displayName: source.displayName,
          version: source.version,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      disabledSources: [...world.disabledSources].sort(),
      ticksPerDay: world.ticksPerDay,
      dayPhases: [...world.dayPhases],
      daysPerSeason: world.daysPerSeason,
      seasons: [...world.seasons],
      ticksPerWeatherPeriod: world.ticksPerWeatherPeriod,
      crops,
      workers,
      buildings,
      buildingStorage,
      inventory: stacksOf(world.inventory),
      wallet: { coins: world.wallet.coins },
      economy: {
        multipliers: [...world.economy.multipliers.entries()]
          .map(([item, multiplier]) => ({ item, multiplier }))
          .sort(byItemId),
        expansionsPurchased: world.economy.expansionsPurchased,
      },
      cropStats: {
        planted: world.cropStats.planted,
        harvested: world.cropStats.harvested,
        lastActivityTick: world.cropStats.lastActivityTick,
      },
      lastPlanted: [...world.lastPlanted.entries()]
        .sort(([a], [b]) => a - b)
        .map(([tile, cropId]) => ({ tile, cropId })),
      ids: { worker: allocator.worker, building: allocator.building },
    },
    quarantine: {
      crops: quarantine.crops.map((crop) => ({ ...crop })),
      buildings: quarantine.buildings.map((entry) => ({
        building: { ...entry.building },
        stacks: entry.stacks.map((stack) => ({ ...stack })),
      })),
      stacks: quarantine.stacks.map((entry) => ({ owner: entry.owner, stack: { ...entry.stack } })),
      lastPlanted: quarantine.lastPlanted.map((entry) => ({ ...entry })),
    },
    plugins: {},
  };
}

/**
 * Document → bytes. Compact JSON: `SAVE_FORMAT.md` mandates inspectability,
 * not pretty-printing — any formatter can expand it, and compact halves the
 * size. Insertion order (the canonical order above) is preserved, which is
 * the whole byte-stability mechanism.
 */
export function serializeSave(document: SaveDocument): string {
  return JSON.stringify(document);
}
