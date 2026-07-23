/**
 * The save document. Phase-07a — `SAVE_FORMAT.md` §2, ADR-015 §1/§6, ADR-002.
 *
 * This is the CURRENT schema: the exact shape version `CURRENT_SCHEMA_VERSION`
 * writes and reads. Older shapes exist only inside migrations (07b), which
 * receive untyped documents and produce this one.
 *
 * Two rules govern every field here (ADR-015 §5, §6):
 * - Only deterministic gameplay state: stable identifiers, integers, and the
 *   3-decimal price multipliers. No runtime pointers, no platform objects, no
 *   renderer/UI state, nothing from settings.json (ADR-014 §4).
 * - The set is COMPLETE for continue-identically restoration — including the
 *   ID allocator's counters (not reconstructible once an ID has been freed)
 *   and each container's stack ORDER (partial-stack top-up order is
 *   behavior). Derived state (crop stage, the grid's `blocked` bits, caches,
 *   snapshots) is recomputed on load, never stored.
 *
 * Changing anything persisted: bump the version, add a migration, add the
 *   previous version's golden fixture, update `SAVE_FORMAT.md` §2 — one
 *   commit (`SAVE_FORMAT.md` §9).
 */

import type { RngState } from '../sim/rng/rng';

/**
 * The format's identity — the second key of every save file, constant for the
 * lifetime of the format (ADR-015 §1). A file without it is not a save.
 */
export const SAVE_MAGIC = 'desktop-life-simulator/save';

/**
 * The save format version. Monotonic integer; bumps ONLY when the persisted
 * shape changes (ADR-015 §2). The only version that ever drives behavior,
 * read in exactly one place: the migration runner.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/** Informational header fields. NEVER drive logic (ADR-015 §1). */
export interface SaveMeta {
  /** Semver of the build that wrote the save. Diagnostic only. */
  readonly gameVersion: string;
  /** World creation time — written once, preserved by every save and migration. */
  readonly createdAtUnixMs: number;
  /** Last successful save — the offline-progress clock anchor (§6.2). */
  readonly savedAtUnixMs: number;
  readonly playtimeTicks: number;
  readonly saveCount: number;
}

/**
 * Dense grid arrays, base64-encoded (`SAVE_FORMAT.md` §2.1). `blocked` is
 * deliberately absent — it derives from the building store and is recomputed
 * on load (`SAVE_FORMAT.md` §2.2).
 */
export interface SaveGrid {
  readonly width: number;
  readonly height: number;
  /** Uint8 per tile — dense tile-kind index. */
  readonly kind: string;
  /** Bitfield, one bit per tile. */
  readonly owned: string;
  /** Uint32 per tile, little-endian — tick tilled, or 0. */
  readonly tilledAt: string;
  /** Uint8 per tile. */
  readonly moisture: string;
}

/** A crop instance — ADR-009 §2: no accumulator, growth derives from the tick. */
export interface SaveCrop {
  readonly tile: number;
  readonly cropId: string;
  readonly plantedTick: number;
}

/** One stack. `qty` per the `SAVE_FORMAT.md` §2 field names. */
export interface SaveStack {
  readonly item: string;
  readonly qty: number;
}

export interface SaveWorkerTask {
  readonly kind: string;
  readonly tile: number;
  /** Present only on a Plant task that carries the seed bin's choice (06c). */
  readonly cropId?: string;
}

/**
 * A worker, complete: `energyTimer` and `replanTick` are sub-period
 * accumulators that the sketch omitted but determinism requires (ADR-015 §6 —
 * the authoritative set is what continue-identically needs, not what looks
 * interesting).
 */
export interface SaveWorker {
  readonly id: number;
  readonly position: number;
  readonly state: string;
  readonly task: SaveWorkerTask | null;
  readonly path: readonly number[];
  readonly pathCursor: number;
  readonly actionProgress: number;
  readonly energy: number;
  readonly energyTimer: number;
  /** Stack ORDER is state — partial-stack top-up order is behavior. */
  readonly carrying: readonly SaveStack[];
  readonly replanTick: number;
}

export interface SaveBuilding {
  readonly id: number;
  readonly tile: number;
  readonly buildingId: string;
}

/** A storing building's container, keyed by building id. */
export interface SaveBuildingStorage {
  readonly building: number;
  readonly stacks: readonly SaveStack[];
}

export interface SaveEconomy {
  /** Sparse — an absent item is at 1.0. Values are exact 3-decimal quantities. */
  readonly multipliers: readonly { readonly item: string; readonly multiplier: number }[];
  readonly expansionsPurchased: number;
}

/** Event-maintained cumulative counters — NOT derivable from the crop map. */
export interface SaveCropStats {
  readonly planted: number;
  readonly harvested: number;
  readonly lastActivityTick: number;
}

/**
 * The ID allocator's counters, persisted verbatim (ADR-015 §6). Reconstructing
 * them as `max(existing) + 1` is wrong the moment any ID has ever been freed:
 * the loaded world would issue a different next ID than the never-saved world,
 * and continue-identically fails.
 */
export interface SaveIds {
  readonly worker: number;
  readonly building: number;
}

export interface SaveWorld {
  readonly seed: number;
  readonly tick: number;
  /** Full generator state — determinism resumes mid-stream, never restarts (ADR-007). */
  readonly rngState: RngState;
  readonly grid: SaveGrid;
  /** Sorted by tile. */
  readonly crops: readonly SaveCrop[];
  /** Sorted by id — which equals live insertion order (monotonic allocator). */
  readonly workers: readonly SaveWorker[];
  /** Sorted by id — which equals live insertion order (monotonic allocator). */
  readonly buildings: readonly SaveBuilding[];
  /** Sorted by building id. */
  readonly buildingStorage: readonly SaveBuildingStorage[];
  /** The player inventory's stacks, in container order (order is state). */
  readonly inventory: readonly SaveStack[];
  readonly wallet: { readonly coins: number };
  readonly economy: SaveEconomy;
  readonly cropStats: SaveCropStats;
  /** The seed bin's per-tile memory, sorted by tile. */
  readonly lastPlanted: readonly { readonly tile: number; readonly cropId: string }[];
  readonly ids: SaveIds;
}

/**
 * The complete document. Key order is canonical and load-bearing:
 * `schemaVersion` FIRST (identifiable in a corrupt file, ADR-002 §1), `magic`
 * second (ADR-015 §1), and serialization preserves this insertion order —
 * which is what makes byte-stability (`SAVE_FORMAT.md` §3.2) hold.
 */
export interface SaveDocument {
  readonly schemaVersion: number;
  readonly magic: string;
  readonly meta: SaveMeta;
  readonly world: SaveWorld;
  /** Reserved since version 1 so the v0.2 loader needs no migration (ADR-002 §5). */
  readonly plugins: Readonly<Record<string, unknown>>;
}
