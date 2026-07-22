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
import { isMature, type CropRegistry } from '../content/crops';
import { CORE_TURNIP } from '../content/crops';
import { type TileKindRegistry } from '../content/tile-kinds';
import { elapsedTicks, type CropStore } from '../world/crop';
import { getKind, isOwned, ownedBounds, tilesInRect, type TileGrid } from '../world/tile-grid';
import { isTilled } from '../world/tile-state';
import { WorkerTaskKind, type WorkerTask } from '../world/worker';

/**
 * The crop a worker replants. `GAME_DESIGN.md` §4.4 says "if seeds are
 * available"; with no seed inventory in v0.1 the worker sows the fastest starter
 * crop so the autonomous harvest→replant loop closes. Seed selection and the
 * seed bin are phase-06 (`AI_RULES.md` §1.5).
 */
export const WORKER_DEFAULT_CROP: ContentId = CORE_TURNIP;

/** The world state task selection reads. `World` satisfies this structurally. */
export interface TaskContext {
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  readonly tick: number;
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

export function selectTask(
  ctx: TaskContext,
  from: TileIndex,
  claimed: ReadonlySet<TileIndex>,
): WorkerTask | null {
  const owned = ownedTiles(ctx.tiles); // already ascending

  const bands: readonly { readonly kind: WorkerTaskKind; readonly tiles: readonly TileIndex[] }[] =
    [
      { kind: WorkerTaskKind.Harvest, tiles: harvestCandidates(ctx, claimed) },
      {
        kind: WorkerTaskKind.Plant,
        tiles: owned.filter((tile) => !claimed.has(tile) && isPlantable(ctx, tile)),
      },
      {
        kind: WorkerTaskKind.Till,
        tiles: owned.filter((tile) => !claimed.has(tile) && isTillable(ctx, tile)),
      },
    ];

  for (const band of bands) {
    const tile = nearest(from, band.tiles);
    if (tile !== null) return { kind: band.kind, tile };
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
      return { type: 'plantCrop', tile: task.tile, cropId: WORKER_DEFAULT_CROP };
    case WorkerTaskKind.Till:
      return { type: 'tillTile', tile: task.tile };
  }
}
