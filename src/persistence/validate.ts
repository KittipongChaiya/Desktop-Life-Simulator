/**
 * Validation. Phase-07b — `SAVE_FORMAT.md` §5, ADR-015 §4/§7.
 *
 * Runs AFTER migration, BEFORE hydration. Two layers:
 *
 * - STRUCTURAL (§5.1): the document is exactly the current shape — every
 *   field present, correctly typed, encodings decodable. A structural
 *   failure is unrecoverable; the pipeline reports it and falls back to
 *   `.bak`. Grid encodings are decoded HERE so corruption is a typed
 *   validation error, never a hydration crash.
 *
 * - SEMANTIC (§5.2): the document is internally coherent. REPAIR where
 *   unambiguous, DROP where meaningless, NEVER DELETE PLAYER VALUE. Every
 *   repair is returned for the load log — a save needing repairs is a
 *   defect worth investigating, not a routine event.
 *
 * Unknown content (§5.3): QUARANTINED, never deleted — moved into the
 * document's `quarantine` section, written back on every save, and restored
 * by the same pass the moment its content is registered again. In v0.1 the
 * known-content set is the core registries; the v0.2 plugin loader widens
 * it, and this module needs no change.
 */

import { appError, ErrorCode } from '../shared/errors';
import { asContentId } from '../shared/ids';
import { err, ok, type Result } from '../shared/result';
import type { BuildingRegistry } from '../sim/content/buildings';
import { createInstalledRegistries } from '../sim/content/installed';
import { MULTIPLIER_CAP, MULTIPLIER_FLOOR } from '../sim/world/economy';
import { WorkerState, WorkerTaskKind } from '../sim/world/worker';
import { BASE_INVENTORY_SLOTS } from '../sim/world/world';

import { decodeBytes, decodeUint32 } from './base64';
import { CURRENT_SCHEMA_VERSION, SAVE_MAGIC, type SaveDocument } from './schema';
import { serializeSave } from './serialize';

/** One §5.2 repair, for the load log. */
export interface Repair {
  readonly rule: string;
  readonly detail: string;
}

/** The registered-content sets a document is checked against. */
export interface KnownContent {
  readonly hasCrop: (id: string) => boolean;
  readonly hasItem: (id: string) => boolean;
  readonly buildings: BuildingRegistry;
  readonly walkableKindIndexes: ReadonlySet<number>;
}

/**
 * The registered content a document is validated against.
 *
 * Phase-08b: this is now whatever sources are INSTALLED rather than the four
 * core registries, which is what lets validation see plugin content in phase-09
 * without another change here. The name is unchanged so every existing caller
 * and test is untouched (ADR-019 §2).
 */
export function coreContent(): KnownContent {
  const { crops, items, buildings, tileKinds } = createInstalledRegistries();
  const walkable = new Set<number>();
  for (const kind of tileKinds.all()) {
    if (kind.walkable) walkable.add(tileKinds.indexOf(kind.id));
  }
  return {
    hasCrop: (id) => crops.has(asContentId(id)),
    hasItem: (id) => items.has(asContentId(id)),
    buildings,
    walkableKindIndexes: walkable,
  };
}

// ---------------------------------------------------------------------------
// Structural (§5.1)
// ---------------------------------------------------------------------------

/** Thrown internally; converted to a typed Result at the boundary. */
class Structural extends Error {}

function req(condition: boolean, path: string, expected: string): void {
  if (!condition) throw new Structural(`${path}: expected ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isStr = (value: unknown): value is string => typeof value === 'string';

const WORKER_STATES: ReadonlySet<string> = new Set<string>(Object.values(WorkerState));
const TASK_KINDS: ReadonlySet<string> = new Set<string>(Object.values(WorkerTaskKind));

function reqStack(value: unknown, path: string): void {
  req(isRecord(value), path, 'a stack record');
  const stack = value as Record<string, unknown>;
  req(isStr(stack['item']), `${path}.item`, 'a string');
  req(isInt(stack['qty']) && stack['qty'] >= 0, `${path}.qty`, 'a non-negative integer');
}

function reqStacks(value: unknown, path: string): void {
  req(Array.isArray(value), path, 'an array');
  (value as unknown[]).forEach((stack, i) => {
    reqStack(stack, `${path}[${i}]`);
  });
}

function reqCrop(value: unknown, path: string): void {
  req(isRecord(value), path, 'a crop record');
  const crop = value as Record<string, unknown>;
  req(isInt(crop['tile']), `${path}.tile`, 'an integer');
  req(isStr(crop['cropId']), `${path}.cropId`, 'a string');
  req(isInt(crop['plantedTick']), `${path}.plantedTick`, 'an integer');
}

function reqBuilding(value: unknown, path: string): void {
  req(isRecord(value), path, 'a building record');
  const building = value as Record<string, unknown>;
  req(isInt(building['id']), `${path}.id`, 'an integer');
  req(isInt(building['tile']), `${path}.tile`, 'an integer');
  req(isStr(building['buildingId']), `${path}.buildingId`, 'a string');
}

function reqGrid(value: unknown): void {
  req(isRecord(value), 'world.grid', 'a record');
  const grid = value as Record<string, unknown>;
  req(isInt(grid['width']) && grid['width'] > 0, 'world.grid.width', 'a positive integer');
  req(isInt(grid['height']) && grid['height'] > 0, 'world.grid.height', 'a positive integer');
  const tiles = (grid['width'] as number) * (grid['height'] as number);
  for (const field of ['kind', 'owned', 'tilledAt', 'wateredAt'] as const) {
    req(isStr(grid[field]), `world.grid.${field}`, 'a base64 string');
  }
  // Decode HERE so a corrupt encoding is a validation error, not a crash.
  let kind: Uint8Array;
  let owned: Uint8Array;
  let tilledAt: Uint32Array;
  let wateredAt: Uint32Array;
  try {
    kind = decodeBytes(grid['kind'] as string);
    owned = decodeBytes(grid['owned'] as string);
    tilledAt = decodeUint32(grid['tilledAt'] as string);
    wateredAt = decodeUint32(grid['wateredAt'] as string);
  } catch (thrown) {
    throw new Structural(
      `world.grid: ${thrown instanceof Error ? thrown.message : 'undecodable encoding'}`,
    );
  }
  req(kind.length === tiles, 'world.grid.kind', `${tiles} bytes`);
  req(owned.length === Math.ceil(tiles / 8), 'world.grid.owned', `${Math.ceil(tiles / 8)} bytes`);
  req(tilledAt.length === tiles, 'world.grid.tilledAt', `${tiles} words`);
  req(wateredAt.length === tiles, 'world.grid.wateredAt', `${tiles} words`);
}

/**
 * Proves an unknown value is a current-version `SaveDocument`. Migration must
 * already have run — an older version here is a failure, not a routing case.
 */
export function parseSaveDocument(value: unknown): Result<SaveDocument> {
  try {
    req(isRecord(value), 'document', 'an object');
    const doc = value as Record<string, unknown>;

    req(
      doc['schemaVersion'] === CURRENT_SCHEMA_VERSION,
      'schemaVersion',
      `${CURRENT_SCHEMA_VERSION}`,
    );
    req(doc['magic'] === SAVE_MAGIC, 'magic', `"${SAVE_MAGIC}" — a file without it is not a save`);

    req(isRecord(doc['meta']), 'meta', 'a record');
    const meta = doc['meta'] as Record<string, unknown>;
    req(isStr(meta['gameVersion']), 'meta.gameVersion', 'a string');
    for (const field of [
      'createdAtUnixMs',
      'savedAtUnixMs',
      'playtimeTicks',
      'saveCount',
    ] as const) {
      req(isInt(meta[field]), `meta.${field}`, 'an integer');
    }

    req(isRecord(doc['world']), 'world', 'a record');
    const world = doc['world'] as Record<string, unknown>;
    req(isInt(world['seed']), 'world.seed', 'an integer');
    req(isInt(world['tick']) && world['tick'] >= 0, 'world.tick', 'a non-negative integer');

    const rng = world['rngState'];
    req(Array.isArray(rng) && rng.length === 4 && rng.every(isInt), 'world.rngState', '4 integers');

    reqGrid(world['grid']);

    req(Array.isArray(world['crops']), 'world.crops', 'an array');
    (world['crops'] as unknown[]).forEach((crop, i) => {
      reqCrop(crop, `world.crops[${i}]`);
    });

    req(Array.isArray(world['workers']), 'world.workers', 'an array');
    (world['workers'] as unknown[]).forEach((value2, i) => {
      const path = `world.workers[${i}]`;
      req(isRecord(value2), path, 'a worker record');
      const worker = value2 as Record<string, unknown>;
      req(isInt(worker['id']), `${path}.id`, 'an integer');
      req(isInt(worker['position']), `${path}.position`, 'an integer');
      req(
        isStr(worker['state']) && WORKER_STATES.has(worker['state']),
        `${path}.state`,
        'a worker state',
      );
      const task = worker['task'];
      if (task !== null) {
        req(isRecord(task), `${path}.task`, 'a task or null');
        const t = task as Record<string, unknown>;
        req(isStr(t['kind']) && TASK_KINDS.has(t['kind']), `${path}.task.kind`, 'a task kind');
        req(isInt(t['tile']), `${path}.task.tile`, 'an integer');
        if (t['cropId'] !== undefined) req(isStr(t['cropId']), `${path}.task.cropId`, 'a string');
      }
      req(
        Array.isArray(worker['path']) && (worker['path'] as unknown[]).every(isInt),
        `${path}.path`,
        'an integer array',
      );
      for (const field of [
        'pathCursor',
        'actionProgress',
        'energy',
        'energyTimer',
        'replanTick',
      ] as const) {
        req(isInt(worker[field]), `${path}.${field}`, 'an integer');
      }
      reqStacks(worker['carrying'], `${path}.carrying`);
    });

    req(Array.isArray(world['buildings']), 'world.buildings', 'an array');
    (world['buildings'] as unknown[]).forEach((building, i) => {
      reqBuilding(building, `world.buildings[${i}]`);
    });

    req(Array.isArray(world['buildingStorage']), 'world.buildingStorage', 'an array');
    (world['buildingStorage'] as unknown[]).forEach((value2, i) => {
      const path = `world.buildingStorage[${i}]`;
      req(isRecord(value2), path, 'a storage record');
      const storage = value2 as Record<string, unknown>;
      req(isInt(storage['building']), `${path}.building`, 'an integer');
      reqStacks(storage['stacks'], `${path}.stacks`);
    });

    reqStacks(world['inventory'], 'world.inventory');

    req(isRecord(world['wallet']), 'world.wallet', 'a record');
    req(
      isInt((world['wallet'] as Record<string, unknown>)['coins']),
      'world.wallet.coins',
      'an integer',
    );

    req(isRecord(world['economy']), 'world.economy', 'a record');
    const economy = world['economy'] as Record<string, unknown>;
    req(Array.isArray(economy['multipliers']), 'world.economy.multipliers', 'an array');
    (economy['multipliers'] as unknown[]).forEach((value2, i) => {
      const path = `world.economy.multipliers[${i}]`;
      req(isRecord(value2), path, 'a multiplier record');
      const entry = value2 as Record<string, unknown>;
      req(isStr(entry['item']), `${path}.item`, 'a string');
      req(isNum(entry['multiplier']), `${path}.multiplier`, 'a number');
    });
    req(
      isInt(economy['expansionsPurchased']) && economy['expansionsPurchased'] >= 0,
      'world.economy.expansionsPurchased',
      'a non-negative integer',
    );

    req(isRecord(world['cropStats']), 'world.cropStats', 'a record');
    const stats = world['cropStats'] as Record<string, unknown>;
    for (const field of ['planted', 'harvested', 'lastActivityTick'] as const) {
      req(isInt(stats[field]), `world.cropStats.${field}`, 'an integer');
    }

    req(Array.isArray(world['lastPlanted']), 'world.lastPlanted', 'an array');
    (world['lastPlanted'] as unknown[]).forEach((value2, i) => {
      const path = `world.lastPlanted[${i}]`;
      req(isRecord(value2), path, 'a record');
      const entry = value2 as Record<string, unknown>;
      req(isInt(entry['tile']), `${path}.tile`, 'an integer');
      req(isStr(entry['cropId']), `${path}.cropId`, 'a string');
    });

    req(isRecord(world['ids']), 'world.ids', 'a record');
    const ids = world['ids'] as Record<string, unknown>;
    req(isInt(ids['worker']) && ids['worker'] >= 1, 'world.ids.worker', 'an integer ≥ 1');
    req(isInt(ids['building']) && ids['building'] >= 1, 'world.ids.building', 'an integer ≥ 1');

    // v2 (ADR-026 §4, ADR-019 §7). Checked with the same strictness as the
    // live world: the source manifest is what names a missing source to the
    // player, and a malformed one survives every future save.
    req(Array.isArray(world['sources']), 'world.sources', 'an array');
    (world['sources'] as unknown[]).forEach((value2, i) => {
      const path = `world.sources[${i}]`;
      req(isRecord(value2), path, 'a record');
      const entry = value2 as Record<string, unknown>;
      req(isStr(entry['id']), `${path}.id`, 'a string');
      req(Array.isArray(entry['namespaces']), `${path}.namespaces`, 'an array');
      (entry['namespaces'] as unknown[]).forEach((namespace, n) => {
        req(isStr(namespace), `${path}.namespaces[${n}]`, 'a string');
      });
      req(isStr(entry['provenance']), `${path}.provenance`, 'a string');
      req(isStr(entry['displayName']), `${path}.displayName`, 'a string');
      req(isStr(entry['version']), `${path}.version`, 'a string');
    });

    // v3 (ADR-020 §2, §3). Both are frozen per world, so a corrupt value here
    // would renumber every past day rather than fail loudly later.
    req(
      isInt(world['ticksPerDay']) && world['ticksPerDay'] > 0,
      'world.ticksPerDay',
      'a positive integer',
    );
    req(Array.isArray(world['dayPhases']), 'world.dayPhases', 'an array');
    req((world['dayPhases'] as unknown[]).length > 0, 'world.dayPhases', 'a non-empty array');
    (world['dayPhases'] as unknown[]).forEach((phase, i) => {
      req(isStr(phase), `world.dayPhases[${i}]`, 'a string');
    });

    // v4 (ADR-021 §1). Frozen per world for the same reason, one level up: a
    // corrupt value here reinterprets which season every past day belonged to.
    req(
      isInt(world['daysPerSeason']) && world['daysPerSeason'] > 0,
      'world.daysPerSeason',
      'a positive integer',
    );
    req(Array.isArray(world['seasons']), 'world.seasons', 'an array');
    req((world['seasons'] as unknown[]).length > 0, 'world.seasons', 'a non-empty array');
    (world['seasons'] as unknown[]).forEach((season, i) => {
      req(isStr(season), `world.seasons[${i}]`, 'a string');
    });

    // v5 (ADR-022 §1). Frozen per world: change it and every past weather
    // period re-derives, moving the rainfall history wetness is summed from.
    req(
      isInt(world['ticksPerWeatherPeriod']) && world['ticksPerWeatherPeriod'] > 0,
      'world.ticksPerWeatherPeriod',
      'a positive integer',
    );

    req(Array.isArray(world['disabledSources']), 'world.disabledSources', 'an array');
    (world['disabledSources'] as unknown[]).forEach((value2, i) => {
      req(isStr(value2), `world.disabledSources[${i}]`, 'a string');
    });

    req(isRecord(doc['quarantine']), 'quarantine', 'a record');
    const quarantine = doc['quarantine'] as Record<string, unknown>;
    req(Array.isArray(quarantine['crops']), 'quarantine.crops', 'an array');
    (quarantine['crops'] as unknown[]).forEach((crop, i) => {
      reqCrop(crop, `quarantine.crops[${i}]`);
    });
    req(Array.isArray(quarantine['buildings']), 'quarantine.buildings', 'an array');
    (quarantine['buildings'] as unknown[]).forEach((value2, i) => {
      const path = `quarantine.buildings[${i}]`;
      req(isRecord(value2), path, 'a record');
      const entry = value2 as Record<string, unknown>;
      reqBuilding(entry['building'], `${path}.building`);
      reqStacks(entry['stacks'], `${path}.stacks`);
    });
    req(Array.isArray(quarantine['stacks']), 'quarantine.stacks', 'an array');
    (quarantine['stacks'] as unknown[]).forEach((value2, i) => {
      const path = `quarantine.stacks[${i}]`;
      req(isRecord(value2), path, 'a record');
      const entry = value2 as Record<string, unknown>;
      req(isStr(entry['owner']), `${path}.owner`, 'a string');
      reqStack(entry['stack'], `${path}.stack`);
    });
    req(Array.isArray(quarantine['lastPlanted']), 'quarantine.lastPlanted', 'an array');
    (quarantine['lastPlanted'] as unknown[]).forEach((value2, i) => {
      const path = `quarantine.lastPlanted[${i}]`;
      req(isRecord(value2), path, 'a record');
      const entry = value2 as Record<string, unknown>;
      req(isInt(entry['tile']), `${path}.tile`, 'an integer');
      req(isStr(entry['cropId']), `${path}.cropId`, 'a string');
    });

    req(isRecord(doc['plugins']), 'plugins', 'a record');

    return ok(value as SaveDocument);
  } catch (thrown) {
    if (thrown instanceof Structural) {
      return err(appError(ErrorCode.ValidationFailed, thrown.message));
    }
    throw thrown;
  }
}

// ---------------------------------------------------------------------------
// Semantic (§5.2) + quarantine (§5.3)
// ---------------------------------------------------------------------------

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

function isOwnedBit(owned: Uint8Array, tile: number): boolean {
  const byte = owned[tile >> 3];
  return byte !== undefined && (byte & (1 << (tile & 7))) !== 0;
}

/** Center of the owned plot — the §5.2 reset target for a lost worker. */
function plotCenter(owned: Uint8Array, width: number, height: number): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let tile = 0; tile < width * height; tile += 1) {
    if (!isOwnedBit(owned, tile)) continue;
    const x = tile % width;
    const y = Math.floor(tile / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return Math.floor(height / 2) * width + Math.floor(width / 2);
  return Math.floor((minY + maxY) / 2) * width + Math.floor((minX + maxX) / 2);
}

/**
 * Repairs a structurally valid document into a coherent one, non-destructively
 * — the input is never mutated; the returned document is a new object.
 */
export function repairSaveDocument(
  document: SaveDocument,
  content: KnownContent,
): { readonly document: SaveDocument; readonly repairs: readonly Repair[] } {
  const doc = JSON.parse(serializeSave(document)) as Mutable<SaveDocument>;
  const repairs: Repair[] = [];
  const log = (rule: string, detail: string): void => {
    repairs.push({ rule, detail });
  };

  const { width, height } = doc.world.grid;
  const tiles = width * height;
  const owned = decodeBytes(doc.world.grid.owned); // structural validation proved this decodes
  const kind = decodeBytes(doc.world.grid.kind);
  const inBounds = (tile: number): boolean => tile >= 0 && tile < tiles;

  // Coins ≥ 0 → clamp (never a crash, never a new game over a sign bit).
  if (doc.world.wallet.coins < 0) {
    log('coins-negative', `coins ${doc.world.wallet.coins} clamped to 0`);
    doc.world.wallet.coins = 0;
  }

  // Crops: bounds → drop; duplicate tile → keep first; unknown → quarantine.
  const cropTiles = new Set<number>();
  doc.world.crops = doc.world.crops.filter((crop) => {
    if (!inBounds(crop.tile)) {
      log('crop-tile-out-of-bounds', `crop at tile ${crop.tile} dropped`);
      return false;
    }
    if (cropTiles.has(crop.tile)) {
      log('crop-tile-duplicate', `second crop at tile ${crop.tile} dropped`);
      return false;
    }
    if (!content.hasCrop(crop.cropId)) {
      log('crop-content-unknown', `crop "${crop.cropId}" at tile ${crop.tile} quarantined`);
      doc.quarantine.crops.push(crop);
      return false;
    }
    cropTiles.add(crop.tile);
    return true;
  });

  // Workers: unique ids, position in bounds, task coherent, stacks known.
  const seenWorkerIds = new Set<number>();
  for (const worker of doc.world.workers) {
    if (seenWorkerIds.has(worker.id)) {
      const reassigned = doc.world.ids.worker;
      doc.world.ids.worker += 1;
      log('worker-id-duplicate', `worker ${worker.id} reassigned to ${reassigned}`);
      worker.id = reassigned;
    }
    seenWorkerIds.add(worker.id);

    if (!inBounds(worker.position)) {
      const center = plotCenter(owned, width, height);
      log('worker-position-out-of-bounds', `worker ${worker.id} reset to plot center ${center}`);
      worker.position = center;
    }

    const clearTask = (rule: string, detail: string): void => {
      log(rule, detail);
      worker.task = null;
      worker.state = 'idle';
      worker.path = [];
      worker.pathCursor = 0;
      worker.actionProgress = 0;
    };
    if (worker.task !== null && !inBounds(worker.task.tile)) {
      clearTask(
        'worker-task-tile-out-of-bounds',
        `worker ${worker.id} task at tile ${worker.task.tile} cleared — idle`,
      );
    }
    if (worker.task?.cropId !== undefined && !content.hasCrop(worker.task.cropId)) {
      clearTask(
        'worker-task-content-unknown',
        `worker ${worker.id} plant task for "${worker.task.cropId}" cleared — idle`,
      );
    }

    worker.carrying = worker.carrying.filter((stack) => {
      if (content.hasItem(stack.item)) return true;
      log(
        'stack-content-unknown',
        `"${stack.item}" ×${stack.qty} (worker:${worker.id}) quarantined`,
      );
      doc.quarantine.stacks.push({ owner: `worker:${worker.id}`, stack });
      return false;
    });
  }

  // Buildings: unique ids, known content (with storage), owned+walkable noted.
  const seenBuildingIds = new Set<number>();
  const quarantinedBuildings = new Set<number>();
  for (const building of doc.world.buildings) {
    if (seenBuildingIds.has(building.id)) {
      const reassigned = doc.world.ids.building;
      doc.world.ids.building += 1;
      log('building-id-duplicate', `building ${building.id} reassigned to ${reassigned}`);
      const storage = doc.world.buildingStorage.find((s) => s.building === building.id);
      building.id = reassigned;
      if (storage !== undefined) storage.building = reassigned;
    }
    seenBuildingIds.add(building.id);
  }
  doc.world.buildings = doc.world.buildings.filter((building) => {
    const unknown = !content.buildings.has(asContentId(building.buildingId));
    if (!unknown && inBounds(building.tile)) {
      // Kept regardless — §5.2: keep the building, log the anomaly.
      if (!isOwnedBit(owned, building.tile)) {
        log(
          'building-tile-not-owned',
          `building ${building.id} stands on unowned tile ${building.tile}`,
        );
      } else if (!content.walkableKindIndexes.has(kind[building.tile] ?? -1)) {
        log(
          'building-tile-not-walkable',
          `building ${building.id} stands on unwalkable terrain at ${building.tile}`,
        );
      }
      return true;
    }
    const rule = unknown ? 'building-content-unknown' : 'building-tile-out-of-bounds';
    log(rule, `building ${building.id} ("${building.buildingId}") quarantined`);
    const storageIndex = doc.world.buildingStorage.findIndex((s) => s.building === building.id);
    const stacks = storageIndex >= 0 ? (doc.world.buildingStorage[storageIndex]?.stacks ?? []) : [];
    if (storageIndex >= 0) doc.world.buildingStorage.splice(storageIndex, 1);
    doc.quarantine.buildings.push({ building, stacks });
    quarantinedBuildings.add(building.id);
    return false;
  });

  // Orphaned storage — a container whose building no longer exists — would
  // throw inside hydration. Its stacks become held value; the restore pass
  // below lands them in the inventory (owner gone, value preserved).
  doc.world.buildingStorage = doc.world.buildingStorage.filter((storage) => {
    if (doc.world.buildings.some((b) => b.id === storage.building)) return true;
    log('storage-orphaned', `storage for missing building ${storage.building} — stacks held`);
    for (const stack of storage.stacks) {
      doc.quarantine.stacks.push({ owner: `building:${storage.building}`, stack });
    }
    return false;
  });

  // Building storage: stacks with unknown items quarantined, owner-tagged.
  for (const storage of doc.world.buildingStorage) {
    storage.stacks = storage.stacks.filter((stack) => {
      if (content.hasItem(stack.item)) return true;
      log(
        'stack-content-unknown',
        `"${stack.item}" ×${stack.qty} (building:${storage.building}) quarantined`,
      );
      doc.quarantine.stacks.push({ owner: `building:${storage.building}`, stack });
      return false;
    });
  }

  // Inventory: unknown items quarantined FIRST (they are not capacity's business).
  doc.world.inventory = doc.world.inventory.filter((stack) => {
    if (content.hasItem(stack.item)) return true;
    log('stack-content-unknown', `"${stack.item}" ×${stack.qty} (inventory) quarantined`);
    doc.quarantine.stacks.push({ owner: 'inventory', stack });
    return false;
  });
  // Over capacity: KEEP the items and log (§5.2, acceptance 11) — deleting the
  // player's goods to satisfy an invariant is worse than the invariant.
  if (doc.world.inventory.length > BASE_INVENTORY_SLOTS) {
    log(
      'inventory-over-capacity',
      `${doc.world.inventory.length} stacks exceed ${BASE_INVENTORY_SLOTS} slots — kept`,
    );
  }

  // Economy: unknown-item multipliers pass through untouched (pure arithmetic,
  // no definition ever dereferenced); out-of-band values clamp into the band,
  // and entries at the cap drop (sparse means absent-is-1.0).
  doc.world.economy.multipliers = doc.world.economy.multipliers.filter((entry) => {
    if (entry.multiplier >= MULTIPLIER_CAP) {
      log('multiplier-out-of-band', `"${entry.item}" at ${entry.multiplier} — dropped (cap)`);
      return false;
    }
    if (entry.multiplier < MULTIPLIER_FLOOR) {
      log('multiplier-out-of-band', `"${entry.item}" at ${entry.multiplier} — clamped to floor`);
      entry.multiplier = MULTIPLIER_FLOOR;
    }
    return true;
  });

  // lastPlanted: bounds → drop; unknown crop → quarantine.
  doc.world.lastPlanted = doc.world.lastPlanted.filter((entry) => {
    if (!inBounds(entry.tile)) {
      log('last-planted-out-of-bounds', `memory at tile ${entry.tile} dropped`);
      return false;
    }
    if (!content.hasCrop(entry.cropId)) {
      log('last-planted-content-unknown', `memory "${entry.cropId}" at ${entry.tile} quarantined`);
      doc.quarantine.lastPlanted.push(entry);
      return false;
    }
    return true;
  });

  // Allocator counters: never behind the highest used id — a behind counter
  // would reissue an existing id on the next hire/build (ADR-015 §6).
  const maxWorkerId = Math.max(0, ...doc.world.workers.map((w) => w.id));
  if (doc.world.ids.worker <= maxWorkerId) {
    log('allocator-behind', `ids.worker ${doc.world.ids.worker} bumped to ${maxWorkerId + 1}`);
    doc.world.ids.worker = maxWorkerId + 1;
  }
  const maxBuildingId = Math.max(
    0,
    ...doc.world.buildings.map((b) => b.id),
    ...doc.quarantine.buildings.map((entry) => entry.building.id),
  );
  if (doc.world.ids.building <= maxBuildingId) {
    log(
      'allocator-behind',
      `ids.building ${doc.world.ids.building} bumped to ${maxBuildingId + 1}`,
    );
    doc.world.ids.building = maxBuildingId + 1;
  }

  // ---- Restoration (§5.3): held entries whose content has returned. -------
  doc.quarantine.crops = doc.quarantine.crops.filter((crop) => {
    const free = inBounds(crop.tile) && !doc.world.crops.some((c) => c.tile === crop.tile);
    if (!content.hasCrop(crop.cropId) || !free) return true; // still held
    log('quarantine-restored', `crop "${crop.cropId}" restored to tile ${crop.tile}`);
    doc.world.crops.push(crop);
    return false;
  });

  doc.quarantine.buildings = doc.quarantine.buildings.filter((entry) => {
    if (quarantinedBuildings.has(entry.building.id)) return true; // held this pass
    const known = content.buildings.has(asContentId(entry.building.buildingId));
    const free =
      inBounds(entry.building.tile) &&
      !doc.world.buildings.some((b) => b.tile === entry.building.tile);
    if (!known || !free) return true;
    log(
      'quarantine-restored',
      `building "${entry.building.buildingId}" restored to tile ${entry.building.tile}`,
    );
    doc.world.buildings.push(entry.building);
    if (entry.stacks.length > 0) {
      doc.world.buildingStorage.push({ building: entry.building.id, stacks: entry.stacks });
    }
    return false;
  });

  doc.quarantine.stacks = doc.quarantine.stacks.filter((entry) => {
    if (!content.hasItem(entry.stack.item)) return true; // still held
    // Back to its owner; a vanished owner falls back to the inventory —
    // over-capacity is tolerated and logged, never a reason to delete value.
    if (entry.owner.startsWith('worker:')) {
      const id = Number(entry.owner.slice('worker:'.length));
      const worker = doc.world.workers.find((w) => w.id === id);
      if (worker !== undefined) {
        worker.carrying.push(entry.stack);
        log('quarantine-restored', `"${entry.stack.item}" ×${entry.stack.qty} → ${entry.owner}`);
        return false;
      }
    } else if (entry.owner.startsWith('building:')) {
      const id = Number(entry.owner.slice('building:'.length));
      const storage = doc.world.buildingStorage.find((s) => s.building === id);
      if (storage !== undefined) {
        storage.stacks.push(entry.stack);
        log('quarantine-restored', `"${entry.stack.item}" ×${entry.stack.qty} → ${entry.owner}`);
        return false;
      }
    }
    doc.world.inventory.push(entry.stack);
    log(
      'quarantine-restored',
      `"${entry.stack.item}" ×${entry.stack.qty} → inventory (owner ${entry.owner} gone)`,
    );
    return false;
  });

  doc.quarantine.lastPlanted = doc.quarantine.lastPlanted.filter((entry) => {
    const free = inBounds(entry.tile) && !doc.world.lastPlanted.some((e) => e.tile === entry.tile);
    if (!content.hasCrop(entry.cropId) || !free) return true;
    log('quarantine-restored', `memory "${entry.cropId}" restored to tile ${entry.tile}`);
    doc.world.lastPlanted.push(entry);
    return false;
  });

  // Restored sparse entries re-sort to keep serialization byte-stable.
  doc.world.crops.sort((a, b) => a.tile - b.tile);
  doc.world.buildings.sort((a, b) => a.id - b.id);
  doc.world.buildingStorage.sort((a, b) => a.building - b.building);
  doc.world.lastPlanted.sort((a, b) => a.tile - b.tile);

  // Via `unknown` because `Mutable<>` widens the readonly RngState tuple to
  // `number[]` — the value itself came from serializing a `SaveDocument`, so
  // the shape is exact.
  return { document: doc as unknown as SaveDocument, repairs };
}
