/**
 * Derived tile status. ADR-009 §1.
 *
 * `TileState` is COMPUTED, never stored. `Planted`, `Growing`, and
 * `HarvestReady` are all "a crop is here, at some maturity" — storing them
 * would duplicate what the crop already carries and give two sources of truth
 * that drift apart on the first migration (`SAVE_FORMAT.md` §2.2).
 *
 * New tile qualities arrive as new orthogonal fields or sparse side-tables,
 * never as new members of this union. Adding fertilizer to a stored enum would
 * multiply its members; adding a field adds one field.
 */

import type { TileIndex } from '../../shared/ids';
import { isMature, stageFor, type CropRegistry } from '../content/crops';
import { growthProgress, type GrowthSource } from '../time/growth';

import { type CropStore } from './crop';
import { isOwned, type TileGrid } from './tile-grid';

export const TileState = {
  /** Untilled ground. */
  Empty: 'empty',
  /** Tilled and ready to plant. */
  Tilled: 'tilled',
  /** A crop was planted but has not visibly sprouted. */
  Planted: 'planted',
  /** A crop is visibly developing. */
  Growing: 'growing',
  /** A crop is mature and can be harvested. */
  HarvestReady: 'harvestReady',
} as const;

export type TileState = (typeof TileState)[keyof typeof TileState];

export interface TileQuery extends GrowthSource {
  readonly grid: TileGrid;
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  readonly tick: number;
}

/** True if the tile has been tilled and not reverted. */
export function isTilled(grid: TileGrid, tile: TileIndex): boolean {
  return (grid.tilledAt[tile] ?? 0) > 0;
}

/** True if a crop occupies the tile. */
export function isOccupied(crops: CropStore, tile: TileIndex): boolean {
  return crops.has(tile);
}

/**
 * Derives a tile's status.
 *
 * Order matters: crop presence dominates tilled-ness, because a planted tile is
 * still tilled underneath and reporting `Tilled` would hide the crop.
 */
export function tileStateAt(query: TileQuery, tile: TileIndex): TileState {
  const crop = query.crops.get(tile);

  if (crop !== undefined) {
    const definition = query.cropRegistry.get(crop.cropId);
    // An unregistered crop id means content vanished (an uninstalled plugin).
    // Report Planted rather than throwing inside a query
    // (SAVE_FORMAT.md §5.3 quarantines rather than deletes).
    if (!definition.ok) return TileState.Planted;

    // GROWTH, not age: rain accelerates it (ADR-022 §4).
    const elapsed = growthProgress(query, crop, query.tick);
    if (isMature(definition.value, elapsed)) return TileState.HarvestReady;
    return stageFor(definition.value, elapsed) === 0 ? TileState.Planted : TileState.Growing;
  }

  return isTilled(query.grid, tile) ? TileState.Tilled : TileState.Empty;
}

/** True if a tile can accept a new crop right now. */
export function isPlantable(query: TileQuery, tile: TileIndex): boolean {
  return isOwned(query.grid, tile) && isTilled(query.grid, tile) && !isOccupied(query.crops, tile);
}
