/**
 * Worker task selection. Phase-04, GAME_DESIGN.md §4.4.
 *
 * PURE. Given the world, a worker's position, and the tiles other workers have
 * already claimed, it returns the single task this worker should pursue — or
 * null, which the FSM turns into "return to Idle and wait" (§4.2, never jams).
 *
 * Fixed priority: harvest → plant → till. Water and deposit are absent by design
 * (see `WorkerTaskKind`). Within the highest non-empty band, nearest-first;
 * distance ties break by LOWEST TILE INDEX, never RNG — determinism is required
 * by ADR-007 and several systems depend on it.
 */

import { manhattanDistance, toPosition } from '../../shared/geometry';
import { type ContentId, type TileIndex } from '../../shared/ids';
import { unwrap } from '../../shared/result';
import { type Command } from '../commands/types';
import { CORE_SEED_BIN } from '../content/buildings';
import { isInSeason, isMature, type CropRegistry } from '../content/crops';
import { CORE_TURNIP } from '../content/crops';
import { type TileKindRegistry } from '../content/tile-kinds';
import { dayFor, seasonFor } from '../time/game-clock';
import { type BuildingStore } from '../world/building';
import { containerCount, type Container } from '../world/container';
import { elapsedTicks, type CropStore } from '../world/crop';
import { getKind, isOwned, ownedBounds, tilesInRect, type TileGrid } from '../world/tile-grid';
import { isTilled } from '../world/tile-state';
import { WorkerTaskKind, type WorkerTask } from '../world/worker';

/**
 * The crop a worker replants — the fastest starter crop, so the autonomous
 * harvest→replant loop closes. "The selected seed" cannot mean the HUD's tool
 * selection: that is presentation state and may not enter the deterministic
 * sim (phase-03.6, ADR-007 §1), so the worker default stands in for it. The
 * seed bin's per-tile memory (06c) refines WHICH crop; seed availability
 * (`GAME_DESIGN.md` §4.4 — "if seeds are available") gates WHETHER.
 */
export const WORKER_DEFAULT_CROP: ContentId = CORE_TURNIP;

/** The world state task selection reads. `World` satisfies this structurally. */
export interface TaskContext {
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  /** The farm stock worker plants draw seeds from (06b interpretation 2). */
  readonly inventory: Container;
  /** Placed buildings — read only for "does a seed bin stand?" (06c). */
  readonly buildings: BuildingStore;
  /** Per-tile last-planted memory, the seed bin's data (06c). */
  readonly lastPlanted: ReadonlyMap<TileIndex, ContentId>;
  readonly tick: number;

  /**
   * The calendar's frozen inputs. Task selection reads the season to decide
   * what may be SOWN — never what may be harvested or tended (ADR-021 §3).
   */
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
  readonly seasons: readonly string[];
}

/** Owned tiles, in ascending index order — the deterministic scan order. */
function ownedTiles(tiles: TileGrid): readonly TileIndex[] {
  const bounds = ownedBounds(tiles);
  if (bounds === null) return [];
  return tilesInRect(tiles, bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y).filter((tile) =>
    isOwned(tiles, tile),
  );
}

/** True if the tile is grass a worker may till (owned, untilled, empty, tillable). */
function isTillable(ctx: TaskContext, tile: TileIndex): boolean {
  if (isTilled(ctx.tiles, tile) || ctx.crops.has(tile)) return false;
  const kind = ctx.tileKinds.byIndex(getKind(ctx.tiles, tile));
  return kind !== undefined && kind.tillable;
}

/** True if the tile is tilled, empty ground a worker may plant on. */
function isPlantable(ctx: TaskContext, tile: TileIndex): boolean {
  return isTilled(ctx.tiles, tile) && !ctx.crops.has(tile);
}

/** True if a mature crop sits on the tile. */
function isHarvestable(ctx: TaskContext, tile: TileIndex): boolean {
  const crop = ctx.crops.get(tile);
  if (crop === undefined) return false;
  const definition = ctx.cropRegistry.get(crop.cropId);
  return definition.ok && isMature(definition.value, elapsedTicks(crop, ctx.tick));
}

/**
 * The nearest tile to `from`, ties broken by lowest index.
 *
 * `candidates` must be in ascending index order; replacing only on a STRICTLY
 * smaller distance then leaves the lowest-index tile winning any tie.
 */
function nearest(from: TileIndex, candidates: readonly TileIndex[]): TileIndex | null {
  const origin = unwrap(toPosition(from));
  let best: TileIndex | null = null;
  let bestDistance = Infinity;
  for (const tile of candidates) {
    const distance = manhattanDistance(origin, unwrap(toPosition(tile)));
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

/** Harvest candidates, in ascending index order (the crops map is insertion-ordered). */
function harvestCandidates(
  ctx: TaskContext,
  claimed: ReadonlySet<TileIndex>,
): readonly TileIndex[] {
  const tiles: TileIndex[] = [];
  for (const tile of ctx.crops.keys()) {
    if (!claimed.has(tile) && isHarvestable(ctx, tile)) tiles.push(tile);
  }
  return tiles.sort((a, b) => a - b);
}

/**
 * True when the farm stock holds a seed for the crop a worker would plant.
 * Without one the plant band is empty — the worker moves to the next band
 * rather than claiming a tile it cannot sow (never jams, §4.2).
 */
function hasSeedFor(ctx: TaskContext, cropId: ContentId): boolean {
  const definition = ctx.cropRegistry.get(cropId);
  return definition.ok && containerCount(ctx.inventory, definition.value.seedItem) >= 1;
}

/** True when a seed bin stands anywhere on the farm (its effect is global). */
function hasSeedBin(ctx: TaskContext): boolean {
  for (const building of ctx.buildings.values()) {
    if (building.buildingId === CORE_SEED_BIN) return true;
  }
  return false;
}

/**
 * Whether a worker could actually put this crop in the ground right now.
 *
 * Seeds AND season, together, because the two failures have the same
 * consequence for task selection and must take the same path: the tile is not
 * a plant candidate, and the worker moves on. **A season may never be the
 * reason a worker stops** (ADR-021 §4) — so out-of-season joins the
 * no-seeds branch phase-06b already built, rather than becoming a new one.
 */
function canSow(ctx: TaskContext, cropId: ContentId): boolean {
  if (!hasSeedFor(ctx, cropId)) return false;

  const definition = ctx.cropRegistry.get(cropId);
  if (!definition.ok) return false;

  const season = seasonFor(dayFor(ctx.tick, ctx.ticksPerDay), ctx.daysPerSeason, ctx.seasons);
  return isInSeason(definition.value, season);
}

/**
 * The crop a worker would sow on `tile`, honouring the seed bin's chain (06c,
 * §5): with a bin, the tile's last crop if its seed is in stock AND in season;
 * falling back to the default otherwise. Returns null when nothing is sowable —
 * the tile is not a plant candidate.
 *
 * The seed bin's memory survives an out-of-season fall-through: `lastPlanted`
 * is not cleared, so when the season turns the tile goes back to its remembered
 * crop with no intervention (ADR-021 §4).
 */
function plantCropFor(ctx: TaskContext, tile: TileIndex, binStands: boolean): ContentId | null {
  if (binStands) {
    const remembered = ctx.lastPlanted.get(tile);
    if (remembered !== undefined && canSow(ctx, remembered)) return remembered;
  }
  return canSow(ctx, WORKER_DEFAULT_CROP) ? WORKER_DEFAULT_CROP : null;
}

export function selectTask(
  ctx: TaskContext,
  from: TileIndex,
  claimed: ReadonlySet<TileIndex>,
): WorkerTask | null {
  const owned = ownedTiles(ctx.tiles); // already ascending
  const binStands = hasSeedBin(ctx);

  const bands: readonly { readonly kind: WorkerTaskKind; readonly tiles: readonly TileIndex[] }[] =
    [
      { kind: WorkerTaskKind.Harvest, tiles: harvestCandidates(ctx, claimed) },
      {
        kind: WorkerTaskKind.Plant,
        tiles: owned.filter(
          (tile) =>
            !claimed.has(tile) &&
            isPlantable(ctx, tile) &&
            plantCropFor(ctx, tile, binStands) !== null,
        ),
      },
      {
        kind: WorkerTaskKind.Till,
        tiles: owned.filter((tile) => !claimed.has(tile) && isTillable(ctx, tile)),
      },
    ];

  for (const band of bands) {
    const tile = nearest(from, band.tiles);
    if (tile === null) continue;
    if (band.kind !== WorkerTaskKind.Plant) return { kind: band.kind, tile };
    const cropId = plantCropFor(ctx, tile, binStands);
    // cropId is non-null by the band filter; guarded over asserted.
    if (cropId !== null) return { kind: WorkerTaskKind.Plant, tile, cropId };
  }
  return null;
}

/**
 * The command that performs a task.
 *
 * Workers submit these through the same dispatcher the player uses — no
 * privileged write path (ADR-010 §6).
 */
export function commandForTask(task: WorkerTask): Command {
  switch (task.kind) {
    case WorkerTaskKind.Harvest:
      return { type: 'harvestCrop', tile: task.tile };
    case WorkerTaskKind.Plant:
      // The crop chosen at selection (the seed bin's chain); default for a
      // legacy task that carries none.
      return { type: 'plantCrop', tile: task.tile, cropId: task.cropId ?? WORKER_DEFAULT_CROP };
    case WorkerTaskKind.Till:
      return { type: 'tillTile', tile: task.tile };
  }
}
