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
export const CURRENT_SCHEMA_VERSION = 6;

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
  /**
   * Uint32 per tile, little-endian — tick last watered, or 0 (v5).
   *
   * REPLACES `moisture`, which was persisted from v1 and read by nothing.
   */
  readonly wateredAt: string;
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
/**
 * A worker's schedule, as stored (v6, ADR-024 §4).
 *
 * Every field optional, mirroring `WorkerSchedule`: absent means
 * unconstrained, and an empty array means constrained to nothing. The two are
 * different states and the save must be able to tell them apart.
 *
 * The zone is an ARRAY here and a Set in the world — JSON has no set, and
 * sorting it on write is what keeps the bytes stable (`SAVE_FORMAT.md` §3.2).
 */
export interface SaveWorkerSchedule {
  readonly taskKinds?: readonly string[];
  readonly zone?: readonly number[];
  readonly shift?: readonly string[];
  readonly priority?: readonly string[];
}

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
  /** What this worker may do (v6). Absent on a v5 save; `{}` after migration. */
  readonly schedule: SaveWorkerSchedule;
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
/**
 * One content source, as recorded in the save (v2, ADR-026 §4).
 *
 * `provenance` is RECORDED here and read by nothing: §4 requires it so the
 * player can be told what kind of thing is missing, and ADR-026 §2 forbids any
 * save-format rule from branching on it.
 */
export interface SaveContentSource {
  readonly id: string;
  readonly namespaces: readonly string[];
  readonly provenance: string;
  readonly displayName: string;
  readonly version: string;
}

export interface SaveIds {
  readonly worker: number;
  readonly building: number;
}

/**
 * Entities referencing content that is not currently registered — an
 * uninstalled plugin, or removed core content (`SAVE_FORMAT.md` §5.3).
 *
 * QUARANTINED, NOT DELETED: removed from the active world, preserved here
 * verbatim, written back on every save, and restored the moment the content
 * returns. Uninstalling a mod must never destroy the farm built with it.
 * Present-and-empty from version 1 so the first quarantined entity (v0.2)
 * needs no migration — the `plugins: {}` reasoning (ADR-002 §5).
 *
 * The quarantine is SESSION state owned by the persistence orchestration,
 * never a field on `World` — the sim must not learn saves exist.
 */
export interface SaveQuarantine {
  readonly crops: readonly SaveCrop[];
  /** A building and the storage container it owned, kept together. */
  readonly buildings: readonly {
    readonly building: SaveBuilding;
    readonly stacks: readonly SaveStack[];
  }[];
  /** `owner`: `"inventory"`, `"worker:<id>"`, or `"building:<id>"`. */
  readonly stacks: readonly { readonly owner: string; readonly stack: SaveStack }[];
  readonly lastPlanted: readonly { readonly tile: number; readonly cropId: string }[];
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
  /**
   * The content sources present when this save was written (v2, ADR-026 §4).
   *
   * INFORMATIONAL. It never drives load behaviour, exactly as `meta.gameVersion`
   * never does (ADR-015 §2). Its purpose is that a returning player is told
   * *"Harvest Moon Expansion is not installed -- 14 crops are being kept safe"*
   * instead of being shown fourteen orphaned ids, or worse, nothing at all.
   * Without it the game knows an id is unknown but cannot name what owned it.
   *
   * Sorted by id, so the document stays byte-stable.
   */
  readonly sources: readonly SaveContentSource[];
  /**
   * Sources the player has switched off, sorted (v2, ADR-019 §7).
   *
   * DISABLED rather than enabled, so that absent means on. A v1 save migrates
   * to an empty list and behaves identically, and a source installed later is
   * active rather than invisible -- the opposite default would make every
   * newly-installed plugin look broken.
   *
   * World state, not a preference: disabling seasons changes what the world
   * DOES, and two players with one seed and different sets have different
   * worlds (ADR-014 §4's boundary, applied rather than broken).
   */
  readonly disabledSources: readonly string[];
  /**
   * The day's length for THIS world, frozen at creation (v3, ADR-020 §2).
   *
   * Written once and never changed. A derived calendar has no history to
   * corrupt, which is exactly why this rule is needed: change it on an existing
   * world and every past day silently renumbers — a player on day 40 becomes a
   * player on day 13. Freezing it per world lets a rebalance change the default
   * for new worlds without rewriting anyone's past.
   */
  readonly ticksPerDay: number;
  /**
   * The day's phases, in order, frozen at creation (v3, ADR-020 §3).
   *
   * Stored for the same reason as `ticksPerDay`: the phases a past day passed
   * through are part of what that day WAS. Adding a phase to the engine must
   * not reinterpret a save written before it existed.
   */
  readonly dayPhases: readonly string[];
  /**
   * The season's length in days, frozen at creation (v4, ADR-021 §1).
   *
   * `ticksPerDay`'s rule one level up: a season is a run of days, so changing
   * this reinterprets which season every past day belonged to.
   */
  readonly daysPerSeason: number;
  /**
   * The year's seasons, in order, frozen at creation (v4, ADR-021 §1).
   *
   * Stored rather than read from the registry because the registry is whatever
   * content is installed TODAY. A source adding a fifth season must not change
   * which season a save's day 30 fell in.
   */
  readonly seasons: readonly string[];
  /**
   * The weather period's length in ticks, frozen at creation (v5, ADR-022 §1).
   *
   * Weather itself is never stored — it is a hash of (seed, period). This is
   * the one input to that hash a rebalance must not reach: change it and every
   * past period re-derives, so the rainfall history wetness is computed from
   * changes underneath a standing crop.
   */
  readonly ticksPerWeatherPeriod: number;
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
  /** Not-active world data — preserved, never deleted (`SAVE_FORMAT.md` §5.3). */
  readonly quarantine: SaveQuarantine;
  /** Reserved since version 1 so the v0.2 loader needs no migration (ADR-002 §5). */
  readonly plugins: Readonly<Record<string, unknown>>;
}

/** The empty quarantine every fresh session starts from. */
export const EMPTY_QUARANTINE: SaveQuarantine = {
  crops: [],
  buildings: [],
  stacks: [],
  lastPlanted: [],
};
